import base64
import os
import pathlib
import plistlib
import subprocess
import tempfile
import types
import unittest
from unittest import mock

import archive_ios
from archive_ios import SIGNING_KEYS, signing_mode


PROFILE = {
    'UUID': 'SYNTH-UUID-0001',
    'Entitlements': {
        'application-identifier': 'SYNTHTEAM123.com.burgonomics',
        'aps-environment': 'production',
    },
}

SIGNING_ENV = {
    'ASC_API_KEY_BASE64': base64.b64encode(b'synthetic-api-key').decode('ascii'),
    'ASC_KEY_ID': 'SYNTHETICKEYID',
    'ASC_ISSUER_ID': 'synthetic-issuer-id',
    'APPLE_TEAM_ID': 'SYNTHTEAM123',
    'IOS_CERTIFICATE_BASE64': base64.b64encode(b'synthetic-p12').decode('ascii'),
    'IOS_CERTIFICATE_PASSWORD': 'synthetic-certificate-password',
    'IOS_PROFILE_BASE64': base64.b64encode(b'synthetic-profile').decode('ascii'),
}

KEYCHAIN_PASSWORD = 'synthetic-keychain-password'
PROFILE_PATH_PART = 'Library/MobileDevice/Provisioning Profiles'


def flatten(argv):
    if len(argv) == 1 and isinstance(argv[0], (list, tuple)):
        return tuple(argv[0])
    return tuple(argv)


class FakeProcess:
    """Hermetic stand-in for the module's ``subprocess``; runs no native command."""

    DEVNULL = subprocess.DEVNULL
    CalledProcessError = subprocess.CalledProcessError
    CompletedProcess = subprocess.CompletedProcess

    def __init__(self, search_list='"/Users/tester/Library/Keychains/login.keychain-db"',
                 profile=PROFILE):
        self.search_list = search_list
        self.profile = profile
        self.run_calls = []
        self.check_output_calls = []
        self.labels = []
        self._failures = []
        self._exits = {}
        self._hooks = []
        self._counts = {}

    def fail(self, label, error, occurrence=1):
        self._failures.append((label, occurrence, error))

    def exit_with(self, label, code, occurrence=1):
        self._exits[(label, occurrence)] = code

    def hook(self, label, action, occurrence=1):
        self._hooks.append((label, occurrence, action))

    @staticmethod
    def label(argv):
        argv = flatten(argv)
        if tuple(argv[:3]) == ('security', 'cms', '-D'):
            return 'decode-profile'
        if tuple(argv[:4]) == ('security', 'list-keychains', '-d', 'user'):
            return 'write-search-list' if '-s' in argv[4:] else 'read-search-list'
        if argv[0] == 'security':
            return argv[1]
        if argv[0] == 'xcodebuild':
            return 'export-archive' if '-exportArchive' in argv else 'build-archive'
        return argv[0]

    def _dispatch(self, argv):
        label = self.label(argv)
        self.labels.append(label)
        self._counts[label] = self._counts.get(label, 0) + 1
        occurrence = self._counts[label]
        for wanted, wanted_occurrence, action in self._hooks:
            if (wanted, wanted_occurrence) == (label, occurrence):
                action(argv)
        if label == 'create-keychain':
            # A real `security create-keychain` leaves the file on disk.
            path = pathlib.Path(argv[-1])
            if not path.exists():
                path.write_bytes(b'synthetic-keychain')
        for wanted, wanted_occurrence, error in self._failures:
            if (wanted, wanted_occurrence) == (label, occurrence):
                raise error
        return label, self._exits.get((label, occurrence), 0)

    def run(self, *argv, **kwargs):
        argv = flatten(argv)
        self.run_calls.append((argv, kwargs))
        _, code = self._dispatch(argv)
        return subprocess.CompletedProcess(argv, code)

    def check_output(self, *argv, **kwargs):
        argv = flatten(argv)
        self.check_output_calls.append((argv, kwargs))
        label, _ = self._dispatch(argv)
        if label == 'read-search-list':
            return self.search_list
        if label == 'decode-profile':
            return plistlib.dumps(self.profile)
        raise AssertionError('unexpected check_output: ' + label)


class SigningModeTest(unittest.TestCase):
    def test_no_secrets_is_unsigned(self): self.assertEqual(signing_mode({}), 'unsigned')
    def test_partial_secrets_fail(self):
        with self.assertRaisesRegex(ValueError, 'Incomplete iOS signing secrets'): signing_mode({'ASC_KEY_ID': 'present'})
    def test_all_secrets_allow_signing(self): self.assertEqual(signing_mode(dict.fromkeys(SIGNING_KEYS, 'present')), 'signed')


class ArchiveMainCleanupTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = pathlib.Path(temporary.name)
        self.home = self.root / 'home'
        self.home.mkdir()
        self.runner_temp = self.root / 'runner-temp'
        self.runner_temp.mkdir()
        self.output = self.root / 'github-output.txt'
        self.env = dict(SIGNING_ENV,
                        RUNNER_TEMP=str(self.runner_temp),
                        GITHUB_OUTPUT=str(self.output))
        self.process = FakeProcess()
        self.installed = (self.home / PROFILE_PATH_PART
                          / ('review-' + PROFILE['UUID'] + '.mobileprovision'))

    def main(self, env=None):
        with mock.patch.dict(os.environ, env if env is not None else self.env, clear=True), \
                mock.patch.object(pathlib.Path, 'home', return_value=self.home), \
                mock.patch.object(archive_ios, 'subprocess', self.process), \
                mock.patch.object(archive_ios, 'secrets',
                                  types.SimpleNamespace(token_urlsafe=lambda size: KEYCHAIN_PASSWORD)):
            archive_ios.main()

    def calls(self, label):
        return [argv for argv, _ in self.process.run_calls
                if FakeProcess.label(argv) == label]

    def output_text(self):
        return self.output.read_text(encoding='utf-8')

    def detail(self, error):
        notes = getattr(error, '__notes__', [])
        failures = getattr(error, 'failures', None) or getattr(error, 'cleanup_failures', ())
        rendered = ' '.join(n + ' ' for n in notes)
        rendered += ' '.join(label + ' (' + kind + ')' for label, kind in failures)
        return rendered

    # ---------- unchanged signing modes ----------

    def test_unsigned_archive_runs_no_signing_state(self):
        self.main({'RUNNER_TEMP': str(self.runner_temp), 'GITHUB_OUTPUT': str(self.output)})
        self.assertEqual(self.process.labels, ['build-archive'])
        argv = self.calls('build-archive')[0]
        self.assertEqual(argv[-2:], ('CODE_SIGNING_ALLOWED=NO', 'archive'))
        self.assertEqual(self.output_text(), 'signed=false\n')
        self.assertEqual(self.process.run_calls[0][1]['check'], True)
        self.assertFalse(self.installed.exists())

    def test_signed_archive_exports_and_cleans_up(self):
        seen = {}

        def inspect_build(argv):
            seen['profile_during_build'] = self.installed.read_bytes()

        self.process.hook('build-archive', inspect_build)
        self.main()
        self.assertEqual(seen['profile_during_build'], b'synthetic-profile')
        self.assertIn('export-archive', self.process.labels)
        self.assertEqual(self.output_text(), 'signed=true\n')
        self.assertFalse(self.installed.exists())
        self.assertEqual(list(self.runner_temp.iterdir()), [])
        keychains = self.calls('create-keychain')[0]
        self.assertEqual(keychains[2:4], ('-p', KEYCHAIN_PASSWORD))
        self.assertTrue(keychains[-1].startswith(str(self.runner_temp)))
        self.assertEqual(len(self.calls('delete-keychain')), 1)
        self.assertEqual(len(self.calls('write-search-list')), 2)

    def test_signed_archive_args_and_export_options_match_customer_contract(self):
        seen = {}

        def capture_export_options(argv):
            options = pathlib.Path(argv[argv.index('-exportOptionsPlist') + 1])
            seen['options'] = plistlib.loads(options.read_bytes())
            seen['export_argv'] = argv

        self.process.hook('export-archive', capture_export_options)
        self.main()

        build = self.calls('build-archive')[0]
        auth_key = build[build.index('-authenticationKeyPath') + 1]
        self.assertTrue(auth_key.endswith('AuthKey_SYNTHETICKEYID.p8'))
        self.assertEqual(build[build.index('-authenticationKeyID') + 1], 'SYNTHETICKEYID')
        self.assertEqual(build[build.index('-authenticationKeyIssuerID') + 1], 'synthetic-issuer-id')
        self.assertIn('DEVELOPMENT_TEAM=SYNTHTEAM123', build)
        self.assertIn('CODE_SIGN_STYLE=Manual', build)
        self.assertIn('CODE_SIGN_IDENTITY=Apple Distribution', build)
        self.assertIn('PROVISIONING_PROFILE_SPECIFIER=SYNTH-UUID-0001', build)

        export = self.calls('export-archive')[0]
        self.assertEqual(export[:2], ('xcodebuild', '-exportArchive'))
        self.assertIn('-archivePath', export)
        self.assertEqual(export[export.index('-exportPath') + 1], 'build/ipa')

        self.assertEqual(seen['options'], {
            'method': 'app-store-connect',
            'destination': 'export',
            'teamID': 'SYNTHTEAM123',
            'signingStyle': 'manual',
            'signingCertificate': 'Apple Distribution',
            'provisioningProfiles': {'com.burgonomics': 'SYNTH-UUID-0001'},
        })
        self.assertEqual(seen['export_argv'], export)

        for argv, _ in self.process.run_calls:
            joined = ' '.join(argv)
            for upload in ('altool', 'notarytool', 'upload', 'publish', 'deliver', '--store'):
                self.assertNotIn(upload, joined)

    def test_unsigned_archive_never_uses_signing_or_store_commands(self):
        self.main({'RUNNER_TEMP': str(self.runner_temp), 'GITHUB_OUTPUT': str(self.output)})
        for argv, _ in self.process.run_calls:
            joined = ' '.join(argv)
            for forbidden in ('-exportArchive', 'security', 'altool', 'notarytool',
                              'upload', 'publish', 'deliver', '--store'):
                self.assertNotIn(forbidden, joined)

    # ---------- primary error preserved, cleanup failures attached ----------

    def test_restore_failure_after_build_failure_preserves_primary(self):
        primary = subprocess.CalledProcessError(65, ['xcodebuild', 'archive'])
        self.process.fail('build-archive', primary)
        self.process.fail('write-search-list',
                          subprocess.CalledProcessError(44, ['security', 'list-keychains']),
                          occurrence=2)
        with self.assertRaises(subprocess.CalledProcessError) as caught:
            self.main()
        self.assertIs(caught.exception, primary)
        self.assertIn('restore-keychain-search-list (CalledProcessError)',
                      self.detail(caught.exception))
        self.assertEqual(len(self.calls('delete-keychain')), 1)
        self.assertFalse(self.installed.exists())
        self.assertIn('write-search-list', self.process.labels)
        self.assertGreater(self.process.labels.index('delete-keychain'),
                           self.process.labels.index('write-search-list'))

    def test_restore_failure_after_success_fails_closed(self):
        self.process.fail('write-search-list',
                          subprocess.CalledProcessError(44, ['security', 'list-keychains']),
                          occurrence=2)
        with self.assertRaises(archive_ios.CleanupError) as caught:
            self.main()
        self.assertEqual(caught.exception.failures,
                         (('restore-keychain-search-list', 'CalledProcessError'),))
        self.assertIn('restore-keychain-search-list (CalledProcessError)',
                      str(caught.exception))
        self.assertIn('build-archive', self.process.labels)
        self.assertIn('export-archive', self.process.labels)
        self.assertEqual(len(self.calls('delete-keychain')), 1)
        self.assertFalse(self.installed.exists())
        self.assertFalse(self.output.exists())

    def test_delete_failure_still_removes_profile(self):
        self.process.exit_with('delete-keychain', 51)
        with self.assertRaises(archive_ios.CleanupError):
            self.main()
        self.assertEqual(len(self.calls('delete-keychain')), 1)
        self.assertFalse(self.installed.exists())
        self.assertFalse(self.output.exists())

    def test_delete_failure_fails_closed_without_leaking_arguments(self):
        self.process.exit_with('delete-keychain', 51)
        with self.assertRaises(archive_ios.CleanupError) as caught:
            self.main()
        self.assertEqual(caught.exception.failures,
                         (('delete-keychain', 'CalledProcessError'),))
        message = str(caught.exception)
        self.assertIn('delete-keychain (CalledProcessError)', message)
        command = self.calls('create-keychain')[0]
        for secret in (KEYCHAIN_PASSWORD, SIGNING_ENV['IOS_CERTIFICATE_PASSWORD'],
                       SIGNING_ENV['ASC_KEY_ID'], command[-1], 'synthetic'):
            self.assertNotIn(secret, message)
        self.assertFalse(self.installed.exists())

    def test_delete_oserror_fails_closed(self):
        self.process.fail('delete-keychain', OSError(5, 'synthetic'))
        with self.assertRaises(archive_ios.CleanupError) as caught:
            self.main()
        self.assertEqual(caught.exception.failures, (('delete-keychain', 'OSError'),))

    def test_unlink_failure_fails_closed(self):
        with mock.patch.object(pathlib.Path, 'unlink', side_effect=OSError(5, 'synthetic')):
            with self.assertRaises(archive_ios.CleanupError) as caught:
                self.main()
        self.assertEqual(caught.exception.failures,
                         (('remove-provisioning-profile', 'OSError'),))

    def test_all_cleanups_attempted_when_each_fails(self):
        primary = OSError('synthetic')
        self.process.fail('write-search-list', primary, occurrence=1)
        self.process.fail('write-search-list', OSError('synthetic'), occurrence=2)
        self.process.exit_with('delete-keychain', 51)
        with mock.patch.object(pathlib.Path, 'unlink', side_effect=OSError(5, 'synthetic')) as unlink:
            with self.assertRaises(OSError) as caught:
                self.main()
        self.assertIs(caught.exception, primary)
        self.assertEqual(caught.exception.cleanup_failures,
                         (('restore-keychain-search-list', 'OSError'),
                          ('delete-keychain', 'CalledProcessError'),
                          ('remove-provisioning-profile', 'OSError')))
        self.assertEqual(len(self.calls('write-search-list')), 2)
        self.assertEqual(len(self.calls('delete-keychain')), 1)
        self.assertEqual(unlink.call_count, 1)
        self.assertTrue(unlink.call_args.kwargs.get('missing_ok'))
        self.assertIn('remove-provisioning-profile (OSError)', self.detail(caught.exception))

    def test_failing_stderr_diagnostic_does_not_mask_primary_or_skip_cleanup(self):
        primary = subprocess.CalledProcessError(65, ['xcodebuild', 'archive'])
        self.process.fail('build-archive', primary)
        self.process.fail('write-search-list',
                          subprocess.CalledProcessError(44, ['security', 'list-keychains']),
                          occurrence=2)

        class BrokenStream:
            def write(self, text): raise OSError(9, 'synthetic')
            def flush(self): raise OSError(9, 'synthetic')

        with mock.patch.object(archive_ios.sys, 'stderr', BrokenStream()):
            with self.assertRaises(subprocess.CalledProcessError) as caught:
                self.main()
        self.assertIs(caught.exception, primary)
        self.assertEqual(len(self.calls('delete-keychain')), 1)
        self.assertFalse(self.installed.exists())

    def test_temporary_directory_cleanup_failure_keeps_earlier_archive_error(self):
        primary = subprocess.CalledProcessError(65, ['xcodebuild', 'archive'])
        self.process.fail('build-archive', primary)
        with mock.patch.object(archive_ios, 'remove_signing_directory',
                               side_effect=OSError(39, 'synthetic')):
            with self.assertRaises(subprocess.CalledProcessError) as caught:
                self.main()
        self.assertIs(caught.exception, primary)
        self.assertIn('remove-signing-temporary-directory (OSError)',
                      self.detail(caught.exception))
        self.assertFalse(self.installed.exists())

    def test_temporary_directory_cleanup_failure_after_success_fails_closed(self):
        with mock.patch.object(archive_ios, 'remove_signing_directory',
                               side_effect=OSError(39, 'synthetic')):
            with self.assertRaises(archive_ios.CleanupError) as caught:
                self.main()
        self.assertEqual(caught.exception.failures,
                         (('remove-signing-temporary-directory', 'OSError'),))
        self.assertIn('remove-signing-temporary-directory (OSError)', str(caught.exception))
        self.assertFalse(self.output.exists())
        self.assertFalse(self.installed.exists())

    def test_temporary_directory_failure_joins_other_cleanup_failures(self):
        self.process.exit_with('delete-keychain', 51)
        with mock.patch.object(archive_ios, 'remove_signing_directory',
                               side_effect=OSError(39, 'synthetic')):
            with self.assertRaises(archive_ios.CleanupError) as caught:
                self.main()
        self.assertEqual(caught.exception.failures,
                         (('delete-keychain', 'CalledProcessError'),
                          ('remove-signing-temporary-directory', 'OSError')))
        self.assertIn('delete-keychain (CalledProcessError)', str(caught.exception))
        self.assertIn('remove-signing-temporary-directory (OSError)', str(caught.exception))
        self.assertFalse(self.installed.exists())
        self.assertFalse(self.output.exists())

    def test_temporary_directory_failure_appends_to_primary_cleanup_failures(self):
        primary = subprocess.CalledProcessError(65, ['xcodebuild', 'archive'])
        self.process.fail('build-archive', primary)
        self.process.exit_with('delete-keychain', 51)
        with mock.patch.object(archive_ios, 'remove_signing_directory',
                               side_effect=OSError(39, 'synthetic')):
            with self.assertRaises(subprocess.CalledProcessError) as caught:
                self.main()
        self.assertIs(caught.exception, primary)
        # The outer teardown must extend, not replace, the inner cleanup report.
        self.assertEqual(caught.exception.cleanup_failures,
                         (('delete-keychain', 'CalledProcessError'),
                          ('remove-signing-temporary-directory', 'OSError')))
        detail = self.detail(caught.exception)
        self.assertIn('delete-keychain (CalledProcessError)', detail)
        self.assertIn('remove-signing-temporary-directory (OSError)', detail)
        self.assertEqual(caught.exception.returncode, 65)
        self.assertFalse(self.installed.exists())

    # ---------- ownership ----------

    def test_early_failure_leaves_no_cleanup(self):
        self.process.profile = dict(PROFILE,
                                    Entitlements={'application-identifier': 'OTHER.com.burgonomics',
                                                  'aps-environment': 'production'})
        with self.assertRaisesRegex(ValueError, 'Distribution profile'):
            self.main()
        self.assertEqual(self.calls('create-keychain'), [])
        self.assertEqual(self.calls('write-search-list'), [])
        self.assertEqual(self.calls('delete-keychain'), [])
        self.assertFalse(self.installed.exists())

    def test_partial_profile_write_is_removed(self):
        def partial_write(descriptor, data):
            handle = os.fdopen(descriptor, 'wb')
            try:
                handle.write(data[:4])
                handle.flush()
            finally:
                handle.close()
            raise OSError(28, 'synthetic')

        with mock.patch.object(archive_ios, 'write_claimed_profile', partial_write):
            with self.assertRaises(OSError) as caught:
                self.main()
        self.assertEqual(caught.exception.errno, 28)
        self.assertEqual(self.calls('create-keychain'), [])
        self.assertEqual(self.calls('write-search-list'), [])
        self.assertFalse(self.installed.exists())

    def test_existing_profile_is_refused_unchanged(self):
        self.installed.parent.mkdir(parents=True)
        self.installed.write_bytes(b'preexisting-owner')
        with self.assertRaisesRegex(ValueError, 'Refusing to overwrite existing provisioning profile'):
            self.main()
        self.assertEqual(self.installed.read_bytes(), b'preexisting-owner')
        self.assertEqual(self.calls('create-keychain'), [])
        self.assertEqual(self.calls('write-search-list'), [])
        self.assertEqual(self.process.labels.count('build-archive'), 0)

    def test_concurrently_created_profile_is_refused_and_kept(self):
        def create_competitor(argv):
            self.installed.parent.mkdir(parents=True, exist_ok=True)
            self.installed.write_bytes(b'concurrent-owner')

        self.process.hook('decode-profile', create_competitor)
        with self.assertRaisesRegex(ValueError, 'Refusing to overwrite existing provisioning profile'):
            self.main()
        self.assertEqual(self.installed.read_bytes(), b'concurrent-owner')
        self.assertEqual(self.calls('create-keychain'), [])
        self.assertEqual(self.calls('write-search-list'), [])

    def test_partial_search_list_change_still_restores(self):
        self.process.fail('write-search-list',
                          subprocess.CalledProcessError(44, ['security', 'list-keychains']))
        with self.assertRaises(subprocess.CalledProcessError):
            self.main()
        self.assertEqual(len(self.calls('write-search-list')), 2)
        self.assertEqual(self.calls('build-archive'), [])

    def test_partial_keychain_create_still_deletes_owned_path(self):
        primary = subprocess.CalledProcessError(1, ['security', 'create-keychain'])
        self.process.fail('create-keychain', primary)
        with self.assertRaises(subprocess.CalledProcessError) as caught:
            self.main()
        self.assertIs(caught.exception, primary)
        deletes = self.calls('delete-keychain')
        self.assertEqual(len(deletes), 1)
        self.assertTrue(deletes[0][-1].startswith(str(self.runner_temp)))
        self.assertTrue(deletes[0][-1].endswith('signing.keychain-db'))
        self.assertFalse(self.installed.exists())

    def test_keychain_deletion_refuses_paths_outside_owned_directory(self):
        outside = self.root / 'preexisting.keychain-db'
        outside.write_bytes(b'preexisting-keychain')
        failures = archive_ios.release_signing_state(
            None, str(outside), self.runner_temp, None)
        self.assertEqual(failures, (('delete-keychain', 'ValueError'),))
        self.assertEqual(outside.read_bytes(), b'preexisting-keychain')
        self.assertEqual(self.process.labels, [])

    # ---------- exact previous search list ----------

    def test_restore_reuses_exact_previous_argv_with_spaces(self):
        self.process.search_list = ('"/Users/tester/Library/Keychains/login.keychain-db" '
                                    '"/Users/tester/Other Keychains/work.keychain-db"')
        self.main()
        expected = ('security', 'list-keychains', '-d', 'user', '-s',
                    '/Users/tester/Library/Keychains/login.keychain-db',
                    '/Users/tester/Other Keychains/work.keychain-db')
        restore = self.calls('write-search-list')[1]
        self.assertEqual(restore, expected)
        mutation = self.calls('write-search-list')[0]
        self.assertEqual(mutation[:5], expected[:5])
        self.assertTrue(mutation[5].endswith('signing.keychain-db'))
        self.assertEqual(mutation[6:], expected[5:])

    def test_empty_previous_search_list_is_restored_not_skipped(self):
        self.process.search_list = ''
        self.main()
        self.assertEqual(self.calls('write-search-list')[0][:-1],
                         ('security', 'list-keychains', '-d', 'user', '-s'))
        self.assertEqual(self.calls('write-search-list')[1],
                         ('security', 'list-keychains', '-d', 'user', '-s'))


if __name__ == '__main__':
    unittest.main()

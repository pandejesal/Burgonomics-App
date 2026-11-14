"""Archive locally on macOS; export only, never upload or deploy."""
import base64
import functools
import os
import pathlib
import plistlib
import re
import secrets
import shlex
import subprocess
import sys
import tempfile

SIGNING_KEYS = ('ASC_API_KEY_BASE64', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'APPLE_TEAM_ID',
                'IOS_CERTIFICATE_BASE64', 'IOS_CERTIFICATE_PASSWORD', 'IOS_PROFILE_BASE64')


class CleanupError(RuntimeError):
    """Owned signing state could not be fully released after a successful build.

    ``failures`` holds stable ``(operation, error type)`` labels only. Neither a
    native command's argv nor its message is carried, because those can contain
    the temporary keychain password or certificate password.
    """

    def __init__(self, failures):
        self.failures = tuple(failures)
        super().__init__(self.message())

    def message(self):
        return 'iOS signing cleanup failed: ' + describe_failures(self.failures)

    def add_failure(self, failure):
        """Record one more owned cleanup failure without replacing the error."""
        self.failures += (failure,)
        self.args = (self.message(),)


class OwnedSigningDirectory:
    """Owned temporary directory that can never hide the primary error.

    ``TemporaryDirectory.__exit__`` runs while an earlier setup or archive error
    is already unwinding, so a failing ``rmtree`` would replace that error with
    an unrelated ``OSError``. Removing the directory as an explicit owned
    cleanup keeps the original exception object and still fails closed when only
    cleanup broke.
    """

    def __init__(self):
        self._temporary = None

    def __enter__(self):
        self._temporary = tempfile.TemporaryDirectory(
            prefix='ios-signing-', dir=os.environ.get('RUNNER_TEMP'))
        return pathlib.Path(self._temporary.name)

    def __exit__(self, error_type, error, traceback):
        try:
            remove_signing_directory(self._temporary)
        except Exception as cleanup_error:
            failure = ('remove-signing-temporary-directory', type(cleanup_error).__name__)
            if isinstance(error, CleanupError):
                error.add_failure(failure)
            elif error is not None:
                attach_cleanup_failures(error, (failure,))
            else:
                raise CleanupError((failure,)) from None
        return False


def remove_signing_directory(directory):
    """Delete the owned temporary directory; the caller turns a failure into a label."""
    directory.cleanup()


def describe_failures(failures):
    return ', '.join(operation + ' (' + error_type + ')' for operation, error_type in failures)


def report_cleanup_failures(failures):
    """Emit a labels-only diagnostic without letting a broken stream abort anything."""
    try:
        print('iOS signing cleanup failed: ' + describe_failures(failures), file=sys.stderr, flush=True)
    except Exception:
        pass


def attach_cleanup_failures(error, failures):
    """Attach the sanitized cleanup report without replacing the primary error.

    An outer protected scope (the owned temporary directory) can report extra
    cleanup failures on an error that already carries an inner report, so the
    tuples are merged instead of overwritten. Both notes stay on the error.
    """
    report_cleanup_failures(failures)
    if isinstance(error, CleanupError):
        for failure in failures:
            error.add_failure(failure)
        return
    note = 'iOS signing cleanup failed: ' + describe_failures(failures)
    try:
        error.add_note(note)
    except AttributeError:  # Python < 3.11
        pass
    existing = tuple(getattr(error, 'cleanup_failures', ()))
    try:
        error.cleanup_failures = existing + tuple(failures)
    except (AttributeError, TypeError):
        pass


OPT_IN_ENV = 'IOS_DISTRIBUTION_OPT_IN'
SIMULATOR_ONLY_ENV = 'CI_SIMULATOR_ONLY'

# Apple's own identifier shapes. These are path-derived values: the key id and
# team id are concatenated into filenames and build settings, and the profile
# UUID becomes a filename inside the user's Provisioning Profiles directory.
# An allowlisted shape is checked instead of trying to sanitise arbitrary text.
API_KEY_ID_RE = re.compile(r'^[A-Z0-9]{10}$')
TEAM_ID_RE = re.compile(r'^[A-Z0-9]{10}$')
UUID_RE = re.compile(r'^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$')


def require_identifier(env, name, pattern):
    """Validate a path-derived identifier before any native work.

    ``fullmatch`` is required: ``re.match`` with a trailing ``$`` accepts one
    trailing newline, so an otherwise-valid value plus '\\n' would pass.
    """
    value = env.get(name) or ''
    if not pattern.fullmatch(value):
        raise ValueError(name + ' is not a well-formed Apple identifier; refusing to sign')
    return value


def validate_signing_identifiers(env):
    """Validate every path-derived signing identifier (signed mode only)."""
    return {
        'key_id': require_identifier(env, 'ASC_KEY_ID', API_KEY_ID_RE),
        'team_id': require_identifier(env, 'APPLE_TEAM_ID', TEAM_ID_RE),
        'issuer_id': require_identifier(env, 'ASC_ISSUER_ID', UUID_RE),
    }


def require_profile_uuid(profile):
    """Validate the profile UUID decoded from the CMS payload.

    The UUID cannot be validated earlier: it only exists after the decode
    command needed to read it. This runs immediately after that decode and
    before any path is derived from it or any keychain state is touched.
    """
    value = profile.get('UUID')
    if not isinstance(value, str) or not UUID_RE.fullmatch(value):
        raise ValueError('provisioning profile UUID is not a well-formed UUID; refusing to install a derived path')
    return value


def signing_mode(env):
    """Decide unsigned vs signed. Distribution requires explicit consent.

    Signing material in the environment is NOT consent: a repo/CI owner may wire
    secrets for future use, and that must never silently authorise an App Store
    distributable build. Consent is the exact string 'true' in
    IOS_DISTRIBUTION_OPT_IN, which no CI default and no secret can supply.

    Ordering is load-bearing: consent is checked BEFORE completeness, so material
    without consent fails closed (rather than reporting "incomplete"), and every
    rejection happens before any temporary directory, subprocess, profile or
    keychain work.
    """
    present = [key for key in SIGNING_KEYS if env.get(key)]
    opted_in = env.get(OPT_IN_ENV) == 'true'
    simulator_only = env.get(SIMULATOR_ONLY_ENV) == 'true'

    if simulator_only and (opted_in or present):
        raise ValueError(
            'CI_SIMULATOR_ONLY=true forbids iOS distribution signing; '
            'unset ' + SIMULATOR_ONLY_ENV + ' or ' + OPT_IN_ENV)

    if not present and not opted_in:
        return 'unsigned'

    if not opted_in:
        raise ValueError(
            'iOS signing material present without ' + OPT_IN_ENV + "='true'; "
            'refusing to sign or to fall back to an unsigned archive')

    missing = [key for key in SIGNING_KEYS if not env.get(key)]
    if missing:
        raise ValueError('Incomplete iOS signing secrets: ' + ', '.join(missing))
    return 'signed'

def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def claim_profile_path(profile):
    """Create ``profile`` exclusively so ownership exists before any byte is written."""
    try:
        return os.open(profile, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise ValueError('Refusing to overwrite existing provisioning profile') from None

def write_claimed_profile(descriptor, data):
    """Write through the descriptor returned by ``claim_profile_path``."""
    try:
        handle = os.fdopen(descriptor, 'wb')
    except BaseException:
        os.close(descriptor)
        raise
    with handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())

def restore_search_list(previous):
    """Restore the exact previous search list; an empty list is restored as-is."""
    run('security', 'list-keychains', '-d', 'user', '-s', *previous)

def delete_owned_keychain(keychain, root):
    """Delete the owned keychain and fail closed on a non-zero exit.

    The path is derived from the owned ``TemporaryDirectory`` and is refused
    outright if it resolves anywhere else, so a pre-existing user keychain can
    never be deleted. ``create-keychain`` can fail after leaving a partial file
    behind, so deletion is always attempted once the path is owned, and a
    non-zero exit is reported instead of being ignored.
    """
    path = pathlib.Path(keychain)
    if path.resolve().parent != pathlib.Path(root).resolve():
        raise ValueError('Refusing to delete keychain outside the owned directory')
    completed = subprocess.run(['security', 'delete-keychain', str(path)],
                               check=False, stdout=subprocess.DEVNULL)
    if completed.returncode:
        raise subprocess.CalledProcessError(completed.returncode, ['security', 'delete-keychain'])

def remove_owned_profile(profile):
    profile.unlink(missing_ok=True)

def release_signing_state(restore, keychain, root, profile):
    """Attempt every owned cleanup, even when an earlier one fails.

    Returns stable ``(operation, error type)`` labels for the failures so the
    caller can report them without leaking argv, paths or passwords.
    """
    operations = []
    if restore is not None:
        operations.append(('restore-keychain-search-list', restore))
    if keychain is not None:
        operations.append(('delete-keychain', lambda: delete_owned_keychain(keychain, root)))
    if profile is not None:
        operations.append(('remove-provisioning-profile', lambda: remove_owned_profile(profile)))
    failures = []
    for operation, action in operations:
        try:
            action()
        except Exception as error:
            failures.append((operation, type(error).__name__))
    return tuple(failures)

STAGE_LABELS = {
    'opt-in': 'ios-signing-consent',
    'signing': 'ios-signing',
    'archive': 'ios-archive',
    'cleanup': 'ios-signing-cleanup',
}


def failure_label(error):
    """Fixed (stage, type) label for an error. Never the message or argv."""
    name = type(error).__name__
    if isinstance(error, CleanupError):
        return STAGE_LABELS['cleanup'], name
    if isinstance(error, ValueError):
        text = str(error)
        if OPT_IN_ENV in text or 'Incomplete iOS signing secrets' in text:
            return STAGE_LABELS['opt-in'], name
        return STAGE_LABELS['signing'], name
    if isinstance(error, subprocess.CalledProcessError):
        return STAGE_LABELS['signing'], name
    return STAGE_LABELS['archive'], name


def archive_with_cli_guard():
    """Run the archive, translating failures into a label-only report.

    Catches every ordinary Exception: a CalledProcessError, TimeoutExpired or
    an unexpected RuntimeError can all carry argv or text containing the
    keychain/certificate passwords, so none may be printed. BaseException is
    deliberately NOT caught — cancellation and keyboard interrupt propagate.

    ``main()`` itself is unchanged and still raises the original object, so
    in-process callers and tests keep full diagnostics and cleanup labels.
    """
    try:
        main()
    except Exception as error:  # noqa: BLE001 - boundary: sanitize, never inspect
        stage, name = failure_label(error)
        report_cli_failure(stage, name, error)
        return 1
    return 0


def report_cli_failure(stage, name, error):
    """Emit fixed labels only; never interpolate argv, paths or messages."""
    try:
        print('::error::iOS archive failed at ' + stage + ' (' + name + ')', file=sys.stderr, flush=True)
    except Exception:
        pass


def cli():
    """Process entry point: exit code only, never a traceback with argv."""
    return archive_with_cli_guard()


def main():
    mode = signing_mode(os.environ)
    # Validated before the archive list is even used, and before any temporary
    # directory, subprocess, profile or keychain operation.
    identifiers = validate_signing_identifiers(os.environ) if mode == 'signed' else None
    archive = ['xcodebuild', '-project', 'ios/App/App.xcodeproj', '-scheme', 'App',
               '-configuration', 'Release', '-destination', 'generic/platform=iOS',
               '-archivePath', 'build/App.xcarchive']
    if mode == 'unsigned':
        print('Signing secrets absent: creating unsigned archive, not an IPA.', flush=True)
        run(*archive, 'CODE_SIGNING_ALLOWED=NO', 'archive')
    else:
        with OwnedSigningDirectory() as root:
            key = root / ('AuthKey_' + identifiers['key_id'] + '.p8')
            cert = root / 'distribution.p12'
            profile = root / 'profile.mobileprovision'
            for path, name in [(key, 'ASC_API_KEY_BASE64'), (cert, 'IOS_CERTIFICATE_BASE64'), (profile, 'IOS_PROFILE_BASE64')]:
                path.write_bytes(base64.b64decode(os.environ[name], validate=True)); path.chmod(0o600)
            data = plistlib.loads(subprocess.check_output(['security', 'cms', '-D', '-i', str(profile)]))
            bundle = 'com.burgonomics'
            team = identifiers['team_id']
            # The UUID only exists after the decode above, so it is validated
            # here: before any path is derived from it and before any keychain
            # state is created or mutated.
            profile_uuid = require_profile_uuid(data)
            if data['Entitlements'].get('application-identifier') != team + '.' + bundle or data['Entitlements'].get('aps-environment') != 'production':
                raise ValueError('Distribution profile bundle/team or production push entitlement mismatch')
            installed = pathlib.Path.home() / 'Library/MobileDevice/Provisioning Profiles' / ('review-' + profile_uuid + '.mobileprovision')
            installed.parent.mkdir(parents=True, exist_ok=True)
            owned_profile = None
            owned_keychain = None
            restore = None
            try:
                profile_bytes = profile.read_bytes()
                descriptor = claim_profile_path(installed)
                owned_profile = installed
                write_claimed_profile(descriptor, profile_bytes)
                previous = tuple(shlex.split(subprocess.check_output(['security', 'list-keychains', '-d', 'user'], text=True)))
                keychain = str(root / 'signing.keychain-db')
                owned_keychain = keychain
                password = secrets.token_urlsafe(32)
                run('security', 'create-keychain', '-p', password, keychain)
                run('security', 'set-keychain-settings', '-lut', '21600', keychain)
                run('security', 'unlock-keychain', '-p', password, keychain)
                run('security', 'import', str(cert), '-P', os.environ['IOS_CERTIFICATE_PASSWORD'], '-A', '-t', 'cert', '-f', 'pkcs12', '-k', keychain, stdout=subprocess.DEVNULL)
                run('security', 'set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-k', password, keychain, stdout=subprocess.DEVNULL)
                restore = functools.partial(restore_search_list, previous)
                run('security', 'list-keychains', '-d', 'user', '-s', keychain, *previous)
                auth = ['-allowProvisioningUpdates', '-authenticationKeyPath', str(key), '-authenticationKeyID', identifiers['key_id'], '-authenticationKeyIssuerID', identifiers['issuer_id']]
                run(*archive, *auth, 'DEVELOPMENT_TEAM=' + team, 'CODE_SIGN_STYLE=Manual', 'CODE_SIGN_IDENTITY=Apple Distribution', 'PROVISIONING_PROFILE_SPECIFIER=' + profile_uuid, 'archive')
                export = root / 'ExportOptions.plist'
                export.write_bytes(plistlib.dumps({'method': 'app-store-connect', 'destination': 'export', 'teamID': team, 'signingStyle': 'manual', 'signingCertificate': 'Apple Distribution', 'provisioningProfiles': {bundle: profile_uuid}}))
                run('xcodebuild', '-exportArchive', '-archivePath', 'build/App.xcarchive', '-exportPath', 'build/ipa', '-exportOptionsPlist', str(export), *auth)
            except BaseException as error:
                failures = release_signing_state(restore, owned_keychain, root, owned_profile)
                if failures:
                    attach_cleanup_failures(error, failures)
                raise
            else:
                failures = release_signing_state(restore, owned_keychain, root, owned_profile)
                if failures:
                    raise CleanupError(failures)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
            output.write('signed=' + str(mode == 'signed').lower() + '\n')

if __name__ == '__main__':
    sys.exit(cli())

"""Archive locally on macOS; export only, never upload or deploy."""
import base64
import os
import pathlib
import plistlib
import secrets
import shlex
import subprocess
import tempfile

SIGNING_KEYS = ('ASC_API_KEY_BASE64', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'APPLE_TEAM_ID',
                'IOS_CERTIFICATE_BASE64', 'IOS_CERTIFICATE_PASSWORD', 'IOS_PROFILE_BASE64')

def signing_mode(env):
    present = [key for key in SIGNING_KEYS if env.get(key)]
    if not present:
        return 'unsigned'
    missing = [key for key in SIGNING_KEYS if not env.get(key)]
    if missing:
        raise ValueError('Incomplete iOS signing secrets: ' + ', '.join(missing))
    return 'signed'

def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def main():
    mode = signing_mode(os.environ)
    archive = ['xcodebuild', '-project', 'ios/App/App.xcodeproj', '-scheme', 'App',
               '-configuration', 'Release', '-destination', 'generic/platform=iOS',
               '-archivePath', 'build/App.xcarchive']
    if mode == 'unsigned':
        print('Signing secrets absent: creating unsigned archive, not an IPA.', flush=True)
        run(*archive, 'CODE_SIGNING_ALLOWED=NO', 'archive')
    else:
        with tempfile.TemporaryDirectory(prefix='ios-signing-', dir=os.environ.get('RUNNER_TEMP')) as directory:
            root = pathlib.Path(directory)
            key = root / ('AuthKey_' + os.environ['ASC_KEY_ID'] + '.p8')
            cert = root / 'distribution.p12'
            profile = root / 'profile.mobileprovision'
            for path, name in [(key, 'ASC_API_KEY_BASE64'), (cert, 'IOS_CERTIFICATE_BASE64'), (profile, 'IOS_PROFILE_BASE64')]:
                path.write_bytes(base64.b64decode(os.environ[name], validate=True)); path.chmod(0o600)
            data = plistlib.loads(subprocess.check_output(['security', 'cms', '-D', '-i', str(profile)]))
            bundle = 'com.burgonomics'
            team = os.environ['APPLE_TEAM_ID']
            if data['Entitlements'].get('application-identifier') != team + '.' + bundle or data['Entitlements'].get('aps-environment') != 'production':
                raise ValueError('Distribution profile bundle/team or production push entitlement mismatch')
            installed = pathlib.Path.home() / 'Library/MobileDevice/Provisioning Profiles' / ('review-' + data['UUID'] + '.mobileprovision')
            installed.parent.mkdir(parents=True, exist_ok=True)
            if installed.exists(): raise ValueError('Refusing to overwrite existing provisioning profile')
            keychain = str(root / 'signing.keychain-db')
            password = secrets.token_urlsafe(32)
            previous = shlex.split(subprocess.check_output(['security', 'list-keychains', '-d', 'user'], text=True))
            try:
                installed.write_bytes(profile.read_bytes())
                run('security', 'create-keychain', '-p', password, keychain)
                run('security', 'set-keychain-settings', '-lut', '21600', keychain)
                run('security', 'unlock-keychain', '-p', password, keychain)
                run('security', 'import', str(cert), '-P', os.environ['IOS_CERTIFICATE_PASSWORD'], '-A', '-t', 'cert', '-f', 'pkcs12', '-k', keychain, stdout=subprocess.DEVNULL)
                run('security', 'set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-k', password, keychain, stdout=subprocess.DEVNULL)
                run('security', 'list-keychains', '-d', 'user', '-s', keychain, *previous)
                auth = ['-allowProvisioningUpdates', '-authenticationKeyPath', str(key), '-authenticationKeyID', os.environ['ASC_KEY_ID'], '-authenticationKeyIssuerID', os.environ['ASC_ISSUER_ID']]
                run(*archive, *auth, 'DEVELOPMENT_TEAM=' + team, 'CODE_SIGN_STYLE=Manual', 'CODE_SIGN_IDENTITY=Apple Distribution', 'PROVISIONING_PROFILE_SPECIFIER=' + data['UUID'], 'archive')
                export = root / 'ExportOptions.plist'
                export.write_bytes(plistlib.dumps({'method': 'app-store-connect', 'destination': 'export', 'teamID': team, 'signingStyle': 'manual', 'signingCertificate': 'Apple Distribution', 'provisioningProfiles': {bundle: data['UUID']}}))
                run('xcodebuild', '-exportArchive', '-archivePath', 'build/App.xcarchive', '-exportPath', 'build/ipa', '-exportOptionsPlist', str(export), *auth)
            finally:
                run('security', 'list-keychains', '-d', 'user', '-s', *previous)
                subprocess.run(['security', 'delete-keychain', keychain], check=False, stdout=subprocess.DEVNULL)
                installed.unlink(missing_ok=True)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
            output.write('signed=' + str(mode == 'signed').lower() + '\n')

if __name__ == '__main__':
    main()

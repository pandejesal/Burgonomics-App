# iOS Build Configuration

This project uses GitHub Actions to build the iOS app on macOS runners, so you never need to interact with a Mac directly.

## How it works

- Push code to `main`/`master` → GitHub Actions builds iOS automatically
- Pull requests also trigger builds for validation
- Manual builds can be triggered from the **Actions** tab in GitHub

## Artifacts

| Artifact | Description |
|---|---|
| `Burgonomics-iOS-Simulator-App.zip` | Always built. Runs on iOS Simulator only. |
| `Burgonomics-iOS-Device-IPA` | Built only when signing secrets are configured. Can be installed on physical devices via TestFlight, Ad Hoc, or Enterprise distribution. |

## Simulator Build (no secrets needed)

The simulator build requires **no configuration**. It compiles the app for the iOS Simulator and uploads a `.zip` containing `App.app`.

You can download the artifact and run it on a Mac with Xcode Simulator, or extract it for testing.

## Device Build (requires secrets)

To build an IPA for physical devices, add these **GitHub Secrets** to your repository:

### Required Secrets

| Secret | Description |
|---|---|
| `IOS_CERTIFICATE_BASE64` | Base64-encoded `.p12` distribution certificate |
| `IOS_CERTIFICATE_PASSWORD` | Password for the `.p12` certificate |
| `IOS_PROVISIONING_PROFILE_BASE64` | Base64-encoded `.mobileprovision` file |
| `IOS_PROVISIONING_PROFILE_UUID` | UUID of the provisioning profile |
| `IOS_TEAM_ID` | Your Apple Developer Team ID (10-character string) |

### How to get these values

1. **Apple Developer Account**: Enroll at [developer.apple.com](https://developer.apple.com)
2. **Create a Distribution Certificate**: 
   - Go to Certificates, Identifiers & Profiles
   - Create a "Apple Distribution" certificate
   - Download the `.p12` file
   - Convert to base64: `base64 -i certificate.p12 -o certificate-base64.txt`
3. **Create a Provisioning Profile**:
   - Create an "Ad Hoc" or "In-House" provisioning profile
   - Download the `.mobileprovision` file
   - Convert to base64: `base64 -i profile.mobileprovision -o profile-base64.txt`
   - Find the UUID: `grep -a "UUID" profile.mobileprovision | head -1`
4. **Find your Team ID**:
   - Log into [developer.apple.com](https://developer.apple.com)
   - Click your name → Membership details
   - Copy the Team ID (e.g., `AB12C3D4EF`)

### Adding secrets to GitHub

```bash
# Using GitHub CLI
gh secret set IOS_CERTIFICATE_BASE64 < certificate-base64.txt
gh secret set IOS_CERTIFICATE_PASSWORD
gh secret set IOS_PROVISIONING_PROFILE_BASE64 < profile-base64.txt
gh secret set IOS_PROVISIONING_PROFILE_UUID
gh secret set IOS_TEAM_ID
```

Or add them via: GitHub → Settings → Secrets and variables → Actions → New repository secret

## Distribution Methods

Once you have an IPA, you can distribute via:

- **TestFlight**: Upload via App Store Connect API or Transporter
- **Ad Hoc**: Install directly on registered devices using the provisioning profile
- **Enterprise**: Internal distribution within your organization
- **Custom App Distribution**: Via Apple Business Manager

## Removing macOS from the picture

With this setup:
- ✅ You write code on Windows
- ✅ You push to GitHub
- ✅ GitHub Actions builds iOS on macOS runners
- ✅ You download the IPA from GitHub Actions artifacts
- ✅ You never touch a Mac

The only time you'd need a Mac is if you want to:
- Open the project in Xcode for native debugging
- Submit directly to App Store Connect with Transporter
- Create/refresh certificates and profiles

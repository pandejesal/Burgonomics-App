"""Static privacy-manifest contract for the Customer iOS app.

Parses the real ``PrivacyInfo.xcprivacy`` with the standard-library ``plistlib``,
so this runs on any machine with Python and needs no macOS, Xcode, signing or
native command.

Scope, deliberately narrow: this pins what the *app bundle* declares. It is not
an aggregated built-framework privacy report, not proof that every SDK's own
manifest is compliant, and not App Store acceptance. Those need a resolved Xcode
archive, which this repository cannot produce on Windows.

Ownership evidence used to justify the assertions (bounded read-only source
scans, recorded in the phase39 evidence folder, not binary proof):

- ``parent-customer-ios-api-inventory-r1.json``: 148 native source files across
  ``ios/App/App``, ``@capacitor``, ``@capacitor-firebase`` and ``@aparajita``;
  exactly **6** matches, all ``UserDefaults.standard``; **zero**
  ``FileTimestamp``, ``DiskSpace`` or ``SystemBootTime`` matches.
- Those 6 are ``@capacitor/preferences`` ``Preferences.swift:18-19`` and its
  migration path ``PreferencesPlugin.swift:89-114`` — the app-only defaults
  store, which is what CA92.1 describes.
- ``App.entitlements`` declares no App Group, so 1C8F.1 (shared defaults) would
  be false.

Run with bytecode disabled so the gate leaves the tree untouched::

    python -B -c "..."        or        PYTHONDONTWRITEBYTECODE=1 python -B
"""

import hashlib
import json
import plistlib
import unittest
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = APP_ROOT / "ios" / "App" / "App" / "PrivacyInfo.xcprivacy"
INFO_PLIST = APP_ROOT / "ios" / "App" / "App" / "Info.plist"
ENTITLEMENTS = APP_ROOT / "ios" / "App" / "App" / "App.entitlements"

USER_DEFAULTS_CATEGORY = "NSPrivacyAccessedAPICategoryUserDefaults"

# Categories that were declared without any supporting call site in the app or
# its installed plugins. Each must be absent, not merely re-reasoned.
UNSUPPORTED_CATEGORIES = {
    "NSPrivacyAccessedAPICategoryFileTimestamp": "C617.1",
    "NSPrivacyAccessedAPICategoryDiskSpace": "85F4.1",
    "NSPrivacyAccessedAPICategorySystemBootTime": "35F9.1",
}

# The collected-data block is a Nutrition Label claim. This digest is the
# SEMANTIC fingerprint of the parsed block (plistlib -> sorted JSON), taken from
# the pre-change manifest. It is deliberately not a raw-byte hash: whitespace and
# comments may move, the declared claim may not.
EXPECTED_COLLECTED_DIGEST = "56cee7f4227bdf76e3017dd0f0fdbcda82698b8ebf56c4b1ad802fb3f8138253"
EXPECTED_COLLECTED_NAMES = [
    "NSPrivacyCollectedDataTypeDeviceID",
    "NSPrivacyCollectedDataTypeCustomerSupport",
    "NSPrivacyCollectedDataTypeEmailAddress",
    "NSPrivacyCollectedDataTypeName",
    "NSPrivacyCollectedDataTypePhoneNumber",
    "NSPrivacyCollectedDataTypePhysicalAddress",
    "NSPrivacyCollectedDataTypePreciseLocation",
    "NSPrivacyCollectedDataTypeUserID",
    "NSPrivacyCollectedDataTypePurchaseHistory",
    "NSPrivacyCollectedDataTypePhotosorVideos",
]


def load_manifest():
    with MANIFEST.open("rb") as handle:
        return plistlib.load(handle)


def accessed_api_map(manifest):
    """Category -> sorted reasons, exactly as declared."""
    return {
        entry["NSPrivacyAccessedAPIType"]: sorted(entry.get("NSPrivacyAccessedAPITypeReasons", []))
        for entry in manifest.get("NSPrivacyAccessedAPITypes", [])
    }


def collected_data_digest(manifest):
    """Semantic fingerprint of the collected-data block (not a byte hash)."""
    block = manifest.get("NSPrivacyCollectedDataTypes", [])
    return hashlib.sha256(json.dumps(block, sort_keys=True).encode("utf-8")).hexdigest()


class AccessedAPIDeclarations(unittest.TestCase):
    def setUp(self):
        self.manifest = load_manifest()
        self.declared = accessed_api_map(self.manifest)

    def test_user_defaults_declared_with_ca92_1(self):
        # CA92.1 is the app-only defaults reason, and the only category with a
        # traced call site (@capacitor/preferences).
        self.assertIn(USER_DEFAULTS_CATEGORY, self.declared)
        self.assertEqual(self.declared[USER_DEFAULTS_CATEGORY], ["CA92.1"])

    def test_user_defaults_does_not_claim_app_group_access(self):
        # 1C8F.1 = defaults shared between App Group members. There is no App
        # Group entitlement and the plugin uses UserDefaults.standard.
        self.assertNotIn(
            "1C8F.1",
            self.declared.get(USER_DEFAULTS_CATEGORY, []),
            "App Group defaults reason is unsupported by app entitlements and plugin code",
        )

    def test_unsupported_categories_are_absent(self):
        for category, code in UNSUPPORTED_CATEGORIES.items():
            with self.subTest(category=category):
                self.assertNotIn(
                    category,
                    self.declared,
                    f"{category} has no app/plugin call site; {code} must not be declared",
                )

    def test_declared_map_is_exactly_user_defaults(self):
        # Nothing else may be added in place of the removed categories either.
        self.assertEqual(set(self.declared), {USER_DEFAULTS_CATEGORY})

    def test_no_category_carries_an_invented_reason(self):
        # E174.1 is the low-space *check* reason for a user-visible disk report.
        # No such feature exists, so it must never appear as a substitute.
        all_reasons = {code for codes in self.declared.values() for code in codes}
        self.assertNotIn("E174.1", all_reasons)
        self.assertEqual(all_reasons, {"CA92.1"})

    def test_every_declared_entry_has_a_known_shape(self):
        for entry in self.manifest.get("NSPrivacyAccessedAPITypes", []):
            self.assertIsInstance(entry["NSPrivacyAccessedAPIType"], str)
            self.assertTrue(entry["NSPrivacyAccessedAPITypeReasons"])


class TrackingAndCollectedData(unittest.TestCase):
    def setUp(self):
        self.manifest = load_manifest()

    def test_tracking_stays_off_and_has_no_domains(self):
        self.assertIs(self.manifest["NSPrivacyTracking"], False)
        self.assertEqual(self.manifest["NSPrivacyTrackingDomains"], [])

    def test_no_collected_type_is_flagged_for_tracking(self):
        for entry in self.manifest.get("NSPrivacyCollectedDataTypes", []):
            self.assertIs(
                entry["NSPrivacyCollectedDataTypeTracking"],
                False,
                f"{entry['NSPrivacyCollectedDataType']} must not claim cross-app tracking",
            )

    def test_collected_data_semantics_are_unchanged(self):
        # Guards Nutrition Label claims against an unrelated manifest edit.
        self.assertEqual(
            collected_data_digest(self.manifest),
            EXPECTED_COLLECTED_DIGEST,
            "collected-data declarations changed; re-review them explicitly",
        )

    def test_collected_data_names_are_exactly_the_reviewed_set(self):
        names = [e["NSPrivacyCollectedDataType"] for e in self.manifest["NSPrivacyCollectedDataTypes"]]
        self.assertEqual(names, EXPECTED_COLLECTED_NAMES)


class AppBundleConfiguration(unittest.TestCase):
    def test_info_plist_has_no_arbitrary_load_ats_exception(self):
        with INFO_PLIST.open("rb") as handle:
            info = plistlib.load(handle)
        ats = info.get("NSAppTransportSecurity", {})
        self.assertNotIn(
            "NSAllowsArbitraryLoads",
            ats,
            "default ATS must apply; no arbitrary-load exception is approved",
        )
        self.assertNotIn("NSAllowsArbitraryLoadsInWebContent", ats)

    def test_entitlements_declare_no_app_group(self):
        with ENTITLEMENTS.open("rb") as handle:
            entitlements = plistlib.load(handle)
        self.assertNotIn("com.apple.security.application-groups", entitlements)
        # Sanity: the file parsed as a real entitlements dict.
        self.assertIn("aps-environment", entitlements)


if __name__ == "__main__":
    unittest.main()

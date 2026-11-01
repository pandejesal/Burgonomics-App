import unittest
from archive_ios import SIGNING_KEYS, signing_mode
class SigningModeTest(unittest.TestCase):
    def test_no_secrets_is_unsigned(self): self.assertEqual(signing_mode({}), 'unsigned')
    def test_partial_secrets_fail(self):
        with self.assertRaisesRegex(ValueError, 'Incomplete iOS signing secrets'): signing_mode({'ASC_KEY_ID': 'present'})
    def test_all_secrets_allow_signing(self): self.assertEqual(signing_mode(dict.fromkeys(SIGNING_KEYS, 'present')), 'signed')
if __name__ == '__main__': unittest.main()

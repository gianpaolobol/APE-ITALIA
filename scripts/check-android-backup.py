"""Verify native prebuild output, not merely the Expo configuration."""
import pathlib
import sys
import xml.etree.ElementTree as ET

root = pathlib.Path(sys.argv[1])
ns = "{http://schemas.android.com/apk/res/android}"
app = ET.parse(root / "AndroidManifest.xml").getroot().find("application")
assert app is not None
assert app.get(ns + "allowBackup") == "false"
assert app.get(ns + "fullBackupContent") == "@xml/ape_no_backup"
assert app.get(ns + "dataExtractionRules") == "@xml/ape_no_transfer"
domains = {"root", "file", "database", "sharedpref", "external",
           "device_root", "device_file", "device_database", "device_sharedpref"}

def verify_rules(node):
    assert node is not None
    assert all(child.tag == "exclude" and child.get("path") == "." for child in node)
    assert {child.get("domain") for child in node} == domains

legacy = ET.parse(root / "res/xml/ape_no_backup.xml").getroot()
assert legacy.tag == "full-backup-content"
verify_rules(legacy)
modern = ET.parse(root / "res/xml/ape_no_transfer.xml").getroot()
assert modern.tag == "data-extraction-rules"
assert {child.tag for child in modern} == {"cloud-backup", "device-transfer"}
for mode in modern:
    verify_rules(mode)
print("Generated Android backup and transfer policy verified")

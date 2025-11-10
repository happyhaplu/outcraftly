from pathlib import Path

TEMPLATE_PATH = Path(__file__).with_name("contacts-import-modal.tsx.template")
TARGET_PATH = Path("app/(dashboard)/contacts/contacts-import-modal.tsx")


def main() -> None:
  if not TEMPLATE_PATH.exists():
    raise FileNotFoundError(f"Template not found: {TEMPLATE_PATH}")

  content = TEMPLATE_PATH.read_text(encoding="utf-8").rstrip() + "\n"
  TARGET_PATH.write_text(content, encoding="utf-8")
  line_count = len(content.splitlines())
  print(f"Wrote {TARGET_PATH} ({line_count} lines)")


if __name__ == "__main__":
  main()

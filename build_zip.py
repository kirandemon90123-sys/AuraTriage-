#!/usr/bin/env python3
"""
AuraTriage (SirenSight) - Repository Bundler
Packages the complete hackathon solution into AuraTriage_SirenSight.zip
"""

import os
import zipfile

def build_zip():
    zip_filename = "AuraTriage_SirenSight.zip"
    exclude_dirs = {
        "node_modules",
        ".git",
        "dist",
        ".playwright-cli",
        ".aistudio",
        "__pycache__",
        ".pytest_cache",
    }
    exclude_files = {
        zip_filename,
        "package-lock.json",
        "bun.lock",
    }

    root_dir = os.path.dirname(os.path.abspath(__file__))
    print(f"📦 Packaging AuraTriage (SirenSight) from {root_dir}...")

    total_files = 0
    with zipfile.ZipFile(zip_filename, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(root_dir):
            # Prune excluded directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith(".")]

            for file in files:
                if file in exclude_files or file.endswith(".pyc") or file.endswith(".swp"):
                    continue

                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, root_dir)
                
                zf.write(abs_path, rel_path)
                total_files += 1

    file_size_kb = os.path.getsize(zip_filename) / 1024
    print(f"✅ Successfully created {zip_filename} ({total_files} files, {file_size_kb:.1f} KB)")
    print(f"Ready for hackathon submission & direct portable deployment!")

if __name__ == "__main__":
    build_zip()

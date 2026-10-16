from __future__ import annotations

import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from services import config as config_module
from services import image_service


class DownloadImagesZipTest(unittest.TestCase):
    def test_downloads_object_stored_image(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with (
                patch.object(config_module, "DATA_DIR", Path(temp_dir)),
                patch.object(image_service.image_storage_service, "get_bytes", return_value=b"remote-image"),
            ):
                archive = image_service.download_images_zip(["remote/example.png"])

        with zipfile.ZipFile(archive) as zipped:
            self.assertEqual(zipped.namelist(), ["example.png"])
            self.assertEqual(zipped.read("example.png"), b"remote-image")


if __name__ == "__main__":
    unittest.main()

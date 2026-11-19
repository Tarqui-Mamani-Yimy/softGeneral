import os

import pytest
from fastapi import HTTPException

from app.modules.videos.paths import get_contained_file


def test_relative_path_is_resolved_inside_storage_dir_not_the_working_directory(tmp_path, monkeypatch):
    storage = tmp_path / "storage"
    evidence = storage / "alerts" / "job" / "alert.jpg"
    evidence.parent.mkdir(parents=True)
    evidence.write_bytes(b"jpg")
    monkeypatch.chdir(tmp_path)  # the API process does not run from STORAGE_DIR

    assert get_contained_file(storage, "alerts/job/alert.jpg") == evidence.resolve()


def test_absolute_path_inside_storage_dir_still_works(tmp_path):
    output = tmp_path / "outputs" / "job.mp4"
    output.parent.mkdir(parents=True)
    output.write_bytes(b"mp4")

    assert get_contained_file(tmp_path, str(output)) == output.resolve()


@pytest.mark.parametrize("candidate", ["../outside.jpg", "alerts/../../outside.jpg"])
def test_relative_path_cannot_escape_storage_dir(tmp_path, candidate):
    storage = tmp_path / "storage"
    storage.mkdir()
    (tmp_path / "outside.jpg").write_bytes(b"secret")

    with pytest.raises(HTTPException) as error:
        get_contained_file(storage, candidate)

    assert error.value.status_code == 404


def test_symlink_to_outside_is_refused(tmp_path):
    storage = tmp_path / "storage"
    storage.mkdir()
    (tmp_path / "outside.jpg").write_bytes(b"secret")
    os.symlink(tmp_path / "outside.jpg", storage / "link.jpg")

    with pytest.raises(HTTPException) as error:
        get_contained_file(storage, "link.jpg")

    assert error.value.status_code == 404

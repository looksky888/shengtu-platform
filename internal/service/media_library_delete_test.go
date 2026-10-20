package service

import (
	"context"
	"testing"
)

// statusProbeObjects lets a test observe the durable record state at the moment
// an object delete is attempted.
type statusProbeObjects struct {
	*memoryMediaObjects
	onDelete func()
}

func (s *statusProbeObjects) Delete(ctx context.Context, key string) error {
	if s.onDelete != nil {
		s.onDelete()
	}
	return s.memoryMediaObjects.Delete(ctx, key)
}

func storeAndUploadMedia(t *testing.T, library *MediaLibrary, ownerID string) string {
	t.Helper()
	url, err := library.StoreImage(mediaPNG(t), "", ownerID, "Alice", "png")
	if err != nil {
		t.Fatalf("StoreImage() error = %v", err)
	}
	rel, err := imageRelativePathFromValue(url)
	if err != nil {
		t.Fatalf("imageRelativePathFromValue() error = %v", err)
	}
	uploadStoredMedia(t, library)
	return rel
}

func TestMediaLibraryDeleteImagesTombstonesRecordBeforeObjectDelete(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	rel := storeAndUploadMedia(t, library, "user-1")
	var statuses []string
	library.objects = &statusProbeObjects{memoryMediaObjects: objects, onDelete: func() {
		asset, ok, err := repo.LoadMediaAsset(rel)
		if err != nil {
			t.Errorf("LoadMediaAsset() error = %v", err)
			return
		}
		if !ok {
			statuses = append(statuses, "<missing>")
			return
		}
		statuses = append(statuses, asset.Status)
	}}

	result, err := library.DeleteImages([]string{rel}, ImageAccessScope{OwnerID: "user-1"})
	if err != nil {
		t.Fatalf("DeleteImages() error = %v", err)
	}
	if result["deleted"] != 1 || result["missing"] != 0 {
		t.Fatalf("DeleteImages() = %#v", result)
	}
	if len(statuses) != 2 {
		t.Fatalf("object deletes = %d statuses %#v, want original and thumbnail", len(statuses), statuses)
	}
	for _, status := range statuses {
		if status != mediaStatusDeleting {
			t.Fatalf("record status during object delete = %q, want %q", status, mediaStatusDeleting)
		}
	}
	if _, ok, err := repo.LoadMediaAsset(rel); err != nil || ok {
		t.Fatalf("row survived delete: ok=%v err=%v", ok, err)
	}
}

func TestMediaLibraryDeleteFailureTombstonesRecordAndRefusesDelivery(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	rel := storeAndUploadMedia(t, library, "user-1")
	asset, ok, err := repo.LoadMediaAsset(rel)
	if err != nil || !ok {
		t.Fatalf("LoadMediaAsset() = ok %v err %v", ok, err)
	}
	objects.failDelete = asset.ObjectKey

	if _, err := library.DeleteImages([]string{rel}, ImageAccessScope{OwnerID: "user-1"}); err == nil {
		t.Fatal("DeleteImages() error = nil, want object deletion failure")
	}
	stored, ok, err := repo.LoadMediaAsset(rel)
	if err != nil || !ok {
		t.Fatalf("tombstone row was lost: ok=%v err=%v", ok, err)
	}
	if stored.Status != mediaStatusDeleting {
		t.Fatalf("status after failed object delete = %q, want %q", stored.Status, mediaStatusDeleting)
	}
	if _, err := library.Delivery(context.Background(), stored, MediaDeliveryOptions{}); err == nil {
		t.Fatal("tombstoned record still served delivery")
	}
	page, err := library.ListImages("https://app.example.test", ImageListQuery{Scope: ImageAccessScope{OwnerID: "user-1"}, Limit: 10})
	if err != nil {
		t.Fatalf("ListImages() error = %v", err)
	}
	if items := page["items"].([]map[string]any); len(items) != 0 {
		t.Fatalf("tombstoned record is still listed: %#v", items)
	}
}

func TestMediaLibraryDeleteImagesContinuesAfterItemFailure(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	failingRel := storeAndUploadMedia(t, library, "user-1")
	failing, ok, err := repo.LoadMediaAsset(failingRel)
	if err != nil || !ok {
		t.Fatalf("LoadMediaAsset() = ok %v err %v", ok, err)
	}
	objects.failDelete = failing.ThumbnailKey
	healthyRel := storeAndUploadMedia(t, library, "user-1")
	healthy, _, _ := repo.LoadMediaAsset(healthyRel)

	if _, err := library.DeleteImages([]string{failingRel, healthyRel}, ImageAccessScope{OwnerID: "user-1"}); err == nil {
		t.Fatal("DeleteImages() error = nil, want the failing item reported")
	}
	if _, ok, err := repo.LoadMediaAsset(healthyRel); err != nil || ok {
		t.Fatalf("later media row survived the batch: ok=%v err=%v", ok, err)
	}
	if _, ok := objects.data[healthy.ObjectKey]; ok {
		t.Fatal("later media object survived the batch")
	}
	if _, ok := objects.data[healthy.ThumbnailKey]; ok {
		t.Fatal("later media thumbnail survived the batch")
	}
	broken, ok, err := repo.LoadMediaAsset(failingRel)
	if err != nil || !ok {
		t.Fatalf("failing media row was lost: ok=%v err=%v", ok, err)
	}
	if broken.Status != mediaStatusDeleting {
		t.Fatalf("failing media status = %q, want %q", broken.Status, mediaStatusDeleting)
	}
}

package protocol

type dueImageCleaner interface {
	CleanupOldImagesIfDue() int
}

func cleanupOldImagesIfDue(config ImageConfig) int {
	if config == nil {
		return 0
	}
	if cleaner, ok := config.(dueImageCleaner); ok {
		return cleaner.CleanupOldImagesIfDue()
	}
	return config.CleanupOldImages()
}

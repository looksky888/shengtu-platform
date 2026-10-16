package service

import "chatgpt2api/internal/util"

type ImageDeleteResultPublic struct {
	Deleted int      `json:"deleted"`
	Missing int      `json:"missing"`
	Paths   []string `json:"paths"`
}

func (s *ImageService) DeleteImagesTyped(paths []string, scope ImageAccessScope) (ImageDeleteResultPublic, error) {
	payload, err := s.DeleteImages(paths, scope)
	if err != nil {
		return ImageDeleteResultPublic{}, err
	}
	removedPaths := util.AsStringSlice(payload["paths"])
	if removedPaths == nil {
		removedPaths = []string{}
	}
	return ImageDeleteResultPublic{
		Deleted: util.ToInt(payload["deleted"], 0),
		Missing: util.ToInt(payload["missing"], 0),
		Paths:   removedPaths,
	}, nil
}

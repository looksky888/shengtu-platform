package util

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"os"
	"strings"

	"github.com/HugoSmits86/nativewebp"
)

const (
	// MaxDecodeImagePixels caps single-frame decoded images at 8192x8192 (67,108,864 pixels).
	MaxDecodeImagePixels int64 = 67_108_864
	// MaxDecodeAnimatedGIFPixels caps total multi-frame GIF pixels across all frames.
	MaxDecodeAnimatedGIFPixels int64 = 150_000_000
)

var ErrImageDimensionsExceeded = errors.New("image dimensions exceed safe decode limit")

func ValidateImageConfigDimensions(width, height int) error {
	if width <= 0 || height <= 0 {
		return fmt.Errorf("invalid image dimensions: %dx%d", width, height)
	}
	pixels := int64(width) * int64(height)
	if pixels <= 0 || pixels > MaxDecodeImagePixels {
		return fmt.Errorf("%w: %dx%d (%d pixels > %d)", ErrImageDimensionsExceeded, width, height, pixels, MaxDecodeImagePixels)
	}
	return nil
}

func ValidateImageBytesDimensions(data []byte) (image.Config, string, error) {
	if len(data) == 0 {
		return image.Config{}, "", errors.New("empty image data")
	}
	cfg, format, err := decodeImageConfigBytes(data)
	if err != nil {
		return image.Config{}, "", err
	}
	if err := ValidateImageConfigDimensions(cfg.Width, cfg.Height); err != nil {
		return image.Config{}, "", err
	}
	if strings.EqualFold(format, "gif") || hasGIFMagic(data) {
		if err := validateAnimatedGIFBytes(data, cfg.Width, cfg.Height); err != nil {
			return image.Config{}, "", err
		}
	}
	return cfg, format, nil
}

func ValidateImageFileDimensions(path string) (image.Config, string, error) {
	f, err := os.Open(path)
	if err != nil {
		return image.Config{}, "", err
	}
	defer f.Close()

	var header [12]byte
	n, _ := io.ReadFull(f, header[:])
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return image.Config{}, "", err
	}

	cfg, format, err := image.DecodeConfig(f)
	if err != nil && isRIFFWebPHeader(header[:n]) {
		if _, seekErr := f.Seek(0, io.SeekStart); seekErr == nil {
			if webpCfg, webpErr := nativewebp.DecodeConfig(f); webpErr == nil {
				cfg = webpCfg
				format = "webp"
				err = nil
			}
		}
	}
	if err != nil {
		return image.Config{}, "", err
	}
	if err := ValidateImageConfigDimensions(cfg.Width, cfg.Height); err != nil {
		return image.Config{}, "", err
	}
	if strings.EqualFold(format, "gif") || hasGIFMagic(header[:n]) {
		if _, err := f.Seek(0, io.SeekStart); err != nil {
			return image.Config{}, "", err
		}
		gifData, err := ReadAllLimited(f, 64<<20)
		if err != nil {
			return image.Config{}, "", err
		}
		if err := validateAnimatedGIFBytes(gifData, cfg.Width, cfg.Height); err != nil {
			return image.Config{}, "", err
		}
	}
	return cfg, format, nil
}

func decodeImageConfigBytes(data []byte) (image.Config, string, error) {
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err == nil {
		return cfg, strings.ToLower(strings.TrimSpace(format)), nil
	}
	if isRIFFWebPHeader(data) {
		if webpCfg, webpErr := nativewebp.DecodeConfig(bytes.NewReader(data)); webpErr == nil {
			return webpCfg, "webp", nil
		}
	}
	return image.Config{}, "", err
}

func hasGIFMagic(data []byte) bool {
	return len(data) >= 6 && (bytes.Equal(data[:6], []byte("GIF87a")) || bytes.Equal(data[:6], []byte("GIF89a")))
}

func isRIFFWebPHeader(data []byte) bool {
	return len(data) >= 12 && bytes.Equal(data[:4], []byte("RIFF")) && bytes.Equal(data[8:12], []byte("WEBP"))
}

func validateAnimatedGIFBytes(data []byte, logicalWidth, logicalHeight int) error {
	if len(data) < 13 || !hasGIFMagic(data) {
		return nil
	}
	pos := 6
	packed := data[pos+4]
	pos += 7
	if packed&0x80 != 0 {
		gctBytes := 3 * (1 << ((packed & 0x07) + 1))
		if pos+gctBytes > len(data) {
			return nil
		}
		pos += gctBytes
	}

	logicalPixels := int64(logicalWidth) * int64(logicalHeight)
	var totalPixels int64
	var frames int64

	skipSubBlocks := func() bool {
		for pos < len(data) {
			blockSize := int(data[pos])
			pos++
			if blockSize == 0 {
				return true
			}
			if pos+blockSize > len(data) {
				return false
			}
			pos += blockSize
		}
		return false
	}

	for pos < len(data) {
		introducer := data[pos]
		pos++
		switch introducer {
		case 0x3B: // Trailer
			return nil
		case 0x21: // Extension
			if pos >= len(data) {
				return nil
			}
			pos++ // extension label
			if !skipSubBlocks() {
				return nil
			}
		case 0x2C: // Image Descriptor
			if pos+9 > len(data) {
				return nil
			}
			frameW := int(binary.LittleEndian.Uint16(data[pos+4 : pos+6]))
			frameH := int(binary.LittleEndian.Uint16(data[pos+6 : pos+8]))
			imgPacked := data[pos+8]
			pos += 9
			if err := ValidateImageConfigDimensions(frameW, frameH); err != nil {
				return err
			}
			framePixels := int64(frameW) * int64(frameH)
			if logicalPixels > framePixels {
				framePixels = logicalPixels
			}
			frames++
			totalPixels += framePixels
			if totalPixels > MaxDecodeAnimatedGIFPixels {
				return fmt.Errorf("%w: animated gif %d frames (%d total pixels > %d)", ErrImageDimensionsExceeded, frames, totalPixels, MaxDecodeAnimatedGIFPixels)
			}
			if imgPacked&0x80 != 0 {
				lctBytes := 3 * (1 << ((imgPacked & 0x07) + 1))
				if pos+lctBytes > len(data) {
					return nil
				}
				pos += lctBytes
			}
			if pos >= len(data) {
				return nil
			}
			pos++ // LZW minimum code size
			if !skipSubBlocks() {
				return nil
			}
		default:
			return nil
		}
	}
	return nil
}

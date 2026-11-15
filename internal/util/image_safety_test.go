package util

import (
	"bytes"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/gif"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func craftedPNGHeaderOnly(width, height uint32) []byte {
	var buf bytes.Buffer
	buf.Write([]byte("\x89PNG\r\n\x1a\n"))
	var ihdr [13]byte
	binary.BigEndian.PutUint32(ihdr[0:4], width)
	binary.BigEndian.PutUint32(ihdr[4:8], height)
	ihdr[8] = 8 // bit depth
	ihdr[9] = 6 // RGBA
	var length [4]byte
	binary.BigEndian.PutUint32(length[:], uint32(len(ihdr)))
	buf.Write(length[:])
	buf.WriteString("IHDR")
	buf.Write(ihdr[:])
	crc := crc32.NewIEEE()
	_, _ = crc.Write([]byte("IHDR"))
	_, _ = crc.Write(ihdr[:])
	var crcBytes [4]byte
	binary.BigEndian.PutUint32(crcBytes[:], crc.Sum32())
	buf.Write(crcBytes[:])
	return buf.Bytes()
}

func craftedAnimatedGIFBomb(width, height uint16, frames int) []byte {
	var buf bytes.Buffer
	buf.WriteString("GIF89a")
	var lsd [7]byte
	binary.LittleEndian.PutUint16(lsd[0:2], width)
	binary.LittleEndian.PutUint16(lsd[2:4], height)
	lsd[4] = 0x80 // 2-color GCT
	buf.Write(lsd[:])
	buf.Write([]byte{0, 0, 0, 255, 255, 255}) // 2 RGB entries
	for i := 0; i < frames; i++ {
		buf.WriteByte(0x2C) // Image Descriptor
		var desc [9]byte
		binary.LittleEndian.PutUint16(desc[4:6], width)
		binary.LittleEndian.PutUint16(desc[6:8], height)
		buf.Write(desc[:])
		buf.WriteByte(2)    // LZW min code size
		buf.WriteByte(2)    // sub-block len
		buf.Write([]byte{0x44, 0x01})
		buf.WriteByte(0)    // sub-block terminator
	}
	buf.WriteByte(0x3B) // Trailer
	return buf.Bytes()
}

func TestValidateImageDimensionsRejectsDecompressionBombs(t *testing.T) {
	// 10000x10000 = 100,000,000 pixels > 67,108,864 max single-frame pixels.
	bombPNG := craftedPNGHeaderOnly(10000, 10000)
	if _, _, err := ValidateImageBytesDimensions(bombPNG); !errors.Is(err, ErrImageDimensionsExceeded) {
		t.Fatalf("ValidateImageBytesDimensions(10000x10000 PNG) err = %v, want ErrImageDimensionsExceeded", err)
	}

	tmpPath := filepath.Join(t.TempDir(), "bomb.png")
	if err := os.WriteFile(tmpPath, bombPNG, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := ValidateImageFileDimensions(tmpPath); !errors.Is(err, ErrImageDimensionsExceeded) {
		t.Fatalf("ValidateImageFileDimensions(10000x10000 PNG) err = %v, want ErrImageDimensionsExceeded", err)
	}

	// 4096x4096 single frame is allowed (~16.7M pixels), but 10 frames = 167.7M > 150M animated GIF limit.
	gifBomb := craftedAnimatedGIFBomb(4096, 4096, 10)
	if _, _, err := ValidateImageBytesDimensions(gifBomb); !errors.Is(err, ErrImageDimensionsExceeded) {
		t.Fatalf("ValidateImageBytesDimensions(4096x4096x10 GIF) err = %v, want ErrImageDimensionsExceeded", err)
	}
}

func TestValidateImageDimensionsAcceptsNormalPNGAndAnimatedGIF(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 64, 48))
	var pngBuf bytes.Buffer
	if err := png.Encode(&pngBuf, img); err != nil {
		t.Fatal(err)
	}
	cfg, format, err := ValidateImageBytesDimensions(pngBuf.Bytes())
	if err != nil || format != "png" || cfg.Width != 64 || cfg.Height != 48 {
		t.Fatalf("ValidateImageBytesDimensions(valid PNG) = (%+v, %q, %v)", cfg, format, err)
	}

	palette := color.Palette{color.Black, color.White}
	anim := &gif.GIF{
		Image: []*image.Paletted{
			image.NewPaletted(image.Rect(0, 0, 32, 32), palette),
			image.NewPaletted(image.Rect(0, 0, 32, 32), palette),
		},
		Delay: []int{10, 10},
	}
	var gifBuf bytes.Buffer
	if err := gif.EncodeAll(&gifBuf, anim); err != nil {
		t.Fatal(err)
	}
	gifCfg, gifFmt, err := ValidateImageBytesDimensions(gifBuf.Bytes())
	if err != nil || gifFmt != "gif" || gifCfg.Width != 32 || gifCfg.Height != 32 {
		t.Fatalf("ValidateImageBytesDimensions(valid GIF) = (%+v, %q, %v)", gifCfg, gifFmt, err)
	}
}

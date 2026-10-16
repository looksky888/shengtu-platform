package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type r2ObjectStoreConfig struct {
	AccountID       string
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
}

type r2ObjectStore struct {
	bucket  string
	client  *s3.Client
	presign *s3.PresignClient
}

func newR2ObjectStore(ctx context.Context, cfg r2ObjectStoreConfig) (*r2ObjectStore, error) {
	cfg.AccountID = strings.TrimSpace(cfg.AccountID)
	cfg.AccessKeyID = strings.TrimSpace(cfg.AccessKeyID)
	cfg.SecretAccessKey = strings.TrimSpace(cfg.SecretAccessKey)
	cfg.Bucket = strings.TrimSpace(cfg.Bucket)
	if cfg.AccountID == "" || cfg.AccessKeyID == "" || cfg.SecretAccessKey == "" || cfg.Bucket == "" {
		return nil, errors.New("R2 媒体存储配置不完整")
	}
	awsCfg, err := awsconfig.LoadDefaultConfig(
		ctx,
		awsconfig.WithRegion("auto"),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, "")),
	)
	if err != nil {
		return nil, fmt.Errorf("初始化 R2 SDK: %w", err)
	}
	endpoint := "https://" + cfg.AccountID + ".r2.cloudflarestorage.com"
	client := s3.NewFromConfig(awsCfg, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(endpoint)
		options.UsePathStyle = true
	})
	return &r2ObjectStore{bucket: cfg.Bucket, client: client, presign: s3.NewPresignClient(client)}, nil
}

func (s *r2ObjectStore) PutFile(ctx context.Context, key, path, contentType, sha256Value string) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("打开上传文件: %w", err)
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return fmt.Errorf("读取上传文件信息: %w", err)
	}
	_, putErr := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(key),
		Body:          file,
		ContentLength: aws.Int64(info.Size()),
		ContentType:   aws.String(contentType),
		Metadata:      map[string]string{"sha256": sha256Value},
	})
	closeErr := file.Close()
	if putErr != nil {
		return fmt.Errorf("上传 R2 对象 %s: %w", key, putErr)
	}
	if closeErr != nil {
		return fmt.Errorf("关闭上传文件: %w", closeErr)
	}
	return nil
}

func (s *r2ObjectStore) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	if err != nil {
		return nil, fmt.Errorf("读取 R2 对象 %s: %w", key, err)
	}
	return out.Body, nil
}

func (s *r2ObjectStore) Head(ctx context.Context, key string) (mediaObjectInfo, error) {
	out, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	if err != nil {
		return mediaObjectInfo{}, fmt.Errorf("检查 R2 对象 %s: %w", key, err)
	}
	return mediaObjectInfo{SizeBytes: aws.ToInt64(out.ContentLength), SHA256: strings.TrimSpace(out.Metadata["sha256"])}, nil
}

func (s *r2ObjectStore) PresignGet(ctx context.Context, key string, ttl time.Duration) (string, error) {
	if ttl < time.Minute {
		ttl = 5 * time.Minute
	}
	out, err := s.presign.PresignGetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)}, func(options *s3.PresignOptions) {
		options.Expires = ttl
	})
	if err != nil {
		return "", fmt.Errorf("生成 R2 临时地址: %w", err)
	}
	return out.URL, nil
}

func (s *r2ObjectStore) PresignHead(ctx context.Context, key string, ttl time.Duration) (string, error) {
	if ttl < time.Minute {
		ttl = 5 * time.Minute
	}
	out, err := s.presign.PresignHeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)}, func(options *s3.PresignOptions) {
		options.Expires = ttl
	})
	if err != nil {
		return "", fmt.Errorf("生成 R2 HEAD 临时地址: %w", err)
	}
	return out.URL, nil
}

func (s *r2ObjectStore) PresignDownload(ctx context.Context, key string, ttl time.Duration, contentDisposition string) (string, error) {
	if ttl < time.Minute {
		ttl = 5 * time.Minute
	}
	out, err := s.presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket:                     aws.String(s.bucket),
		Key:                        aws.String(key),
		ResponseContentDisposition: aws.String(contentDisposition),
	}, func(options *s3.PresignOptions) {
		options.Expires = ttl
	})
	if err != nil {
		return "", fmt.Errorf("生成 R2 下载临时地址: %w", err)
	}
	return out.URL, nil
}

func (s *r2ObjectStore) Delete(ctx context.Context, key string) error {
	if strings.TrimSpace(key) == "" {
		return nil
	}
	if _, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)}); err != nil {
		return fmt.Errorf("删除 R2 对象 %s: %w", key, err)
	}
	return nil
}

func (s *r2ObjectStore) Health(ctx context.Context) error {
	if _, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(s.bucket)}); err != nil {
		return fmt.Errorf("R2 Bucket 健康检查失败: %w", err)
	}
	return nil
}

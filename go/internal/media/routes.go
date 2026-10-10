// Package media serves admin image uploads: a presigned S3 PUT under
// media/, or, with SITE_STORAGE=filesystem, a PUT to this API that writes
// into the local site root.
package media

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/store"
)

const (
	uploadTTL = 15 * time.Minute
	// maxBytes is enforced by the signed Content-Length.
	maxBytes = 10 * 1024 * 1024
)

var extByType = map[string]string{
	"image/jpeg": "jpg",
	"image/png":  "png",
	"image/webp": "webp",
	"image/gif":  "gif",
}

var contentTypes = []string{"image/jpeg", "image/png", "image/webp", "image/gif"}

// Routes take a nil presigner outside Lambda, where only filesystem
// storage is served.
func Routes(presign *s3.PresignClient, now func() time.Time) []api.Route {
	if now == nil {
		now = time.Now
	}
	h := handlers{presign: presign, now: now}
	return []api.Route{
		{Method: http.MethodPost, Pattern: "/admin/media/upload-url", Auth: api.SiteAdmin, Metric: "MediaUploadUrl", Handler: h.uploadURL},
		{Method: http.MethodPut, Pattern: "/admin/media/objects/:key+", Auth: api.SiteAdmin, Metric: "MediaPutObject", Handler: h.putObject},
	}
}

type handlers struct {
	presign *s3.PresignClient
	now     func() time.Time
}

func filesystemStorage() bool { return os.Getenv("SITE_STORAGE") == "filesystem" }

func siteBucketName() (string, error) {
	name := strings.TrimSpace(os.Getenv("SITE_BUCKET_NAME"))
	if name == "" {
		return "", errors.New("SITE_BUCKET_NAME is not set")
	}
	return name, nil
}

var filenameExt = regexp.MustCompile(`\.([a-zA-Z0-9]{1,8})$`)

func extension(contentType string, filename *string) string {
	if filename != nil {
		if m := filenameExt.FindStringSubmatch(api.TrimJS(*filename)); m != nil {
			ext := strings.ToLower(m[1])
			if slices.Contains([]string{"jpg", "jpeg", "png", "webp", "gif"}, ext) {
				if ext == "jpeg" {
					return "jpg"
				}
				return ext
			}
		}
	}
	return extByType[contentType]
}

// objectKey is media/yyyy/mm/<16 hex>.<ext>; the id is the head of a random
// UUID, version nibble included.
func objectKey(contentType string, filename *string, now time.Time) string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	now = now.UTC()
	return fmt.Sprintf("media/%04d/%02d/%s.%s", now.Year(), int(now.Month()), hex.EncodeToString(b[:]), extension(contentType, filename))
}

type uploadURLResponse struct {
	UploadURL  string            `json:"uploadUrl"`
	PublicPath string            `json:"publicPath"`
	Headers    map[string]string `json:"headers"`
	ExpiresAt  string            `json:"expiresAt"`
}

func (h handlers) uploadURL(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	contentType, _ := v.Enum("contentType", true, contentTypes...)
	contentLength, _ := v.Int("contentLength", true, api.Positive, api.MaxInt(maxBytes))
	var filename *string
	if s, ok := v.String("filename", false, false, api.MinLen(1), api.MaxLen(200)); ok {
		filename = &s
	}
	if err := v.Err(); err != nil {
		return nil, err
	}
	bucket, err := siteBucketName()
	if err != nil {
		return nil, err
	}
	now := h.now()
	key := objectKey(contentType, filename, now)
	res := uploadURLResponse{
		PublicPath: "/" + key,
		Headers:    map[string]string{"Content-Type": contentType},
		ExpiresAt:  store.ISOTime(now.Add(uploadTTL)),
	}
	if filesystemStorage() {
		origin := strings.TrimSpace(os.Getenv("VITE_LOCAL_API_ORIGIN"))
		if origin == "" {
			port := os.Getenv("LOCAL_API_PORT")
			if port == "" {
				port = "8787"
			}
			origin = "http://127.0.0.1:" + port
		}
		res.UploadURL = strings.TrimSuffix(origin, "/") + "/api/admin/media/objects/" + url.QueryEscape(key)
		return api.JSON(http.StatusOK, res), nil
	}
	if h.presign == nil {
		return nil, errors.New("media uploads need S3 or SITE_STORAGE=filesystem")
	}
	signed, err := h.presign.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(bucket),
		Key:           aws.String(key),
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(contentLength),
	}, s3.WithPresignExpires(uploadTTL))
	if err != nil {
		return nil, err
	}
	res.UploadURL = signed.URL
	return api.JSON(http.StatusOK, res), nil
}

func (h handlers) putObject(_ context.Context, r *api.Request) (*api.Response, error) {
	if !filesystemStorage() {
		return api.JSON(http.StatusNotFound, map[string]string{
			"error":   "not_found",
			"message": "Local media PUT is only available in filesystem mode",
		}), nil
	}
	expected, err := strconv.ParseFloat(strings.TrimSpace(r.Headers["content-length"]), 64)
	if err != nil || expected < 1 {
		return api.JSON(http.StatusBadRequest, map[string]string{
			"error":   "bad_request",
			"message": "Content-Length required",
		}), nil
	}
	key := r.Params["key"]
	if !strings.HasPrefix(key, "media/") || strings.Contains(key, "..") {
		return nil, errors.New("invalid media key")
	}
	if float64(len(r.Body)) != expected {
		return nil, fmt.Errorf("Content-Length mismatch: expected %v, got %d", expected, len(r.Body))
	}
	root, err := siteBucketName()
	if err != nil {
		return nil, err
	}
	dest := filepath.Join(root, key)
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return nil, err
	}
	if err := os.WriteFile(dest, r.Body, 0o644); err != nil {
		return nil, err
	}
	return &api.Response{Status: http.StatusNoContent}, nil
}

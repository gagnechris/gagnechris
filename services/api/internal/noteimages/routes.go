// Package noteimages stores images pasted into Notebook notes in a private
// bucket, under images/<user>/, and hands the owner short-lived URLs to
// upload and load them. With filesystem storage the browser PUTs to this API
// and reads come back as data: URLs.
package noteimages

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/jstime"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

const (
	uploadTTL = 15 * time.Minute
	readTTL   = time.Hour
	srcPrefix = "notebook-image:"
)

var limits = contract.Data.Limits

var extByType = map[string]string{
	"image/jpeg": "jpg",
	"image/png":  "png",
	"image/webp": "webp",
	"image/gif":  "gif",
}

var typeByExt = func() map[string]string {
	m := make(map[string]string, len(extByType))
	for contentType, ext := range extByType {
		m[ext] = contentType
	}
	return m
}()

var namePattern = regexp.MustCompile(`^[0-9a-f]{16}\.(jpg|png|webp|gif)$`)

// localKeyPattern is any user's key: the browser PUT carries no token, so
// locally it arrives as the default user.
var localKeyPattern = regexp.MustCompile(`^images/[A-Za-z0-9_-]+/[0-9a-f]{16}\.(jpg|png|webp|gif)$`)

type Config struct {
	// Bucket is the private Notebook media bucket, or with Filesystem a local
	// directory.
	Bucket     string
	Filesystem bool
	// LocalOrigin is where, with Filesystem, the browser PUTs uploads.
	LocalOrigin string
}

func Routes(presign *s3.PresignClient, table *data.Table, cfg Config, now func() time.Time) []api.Route {
	if now == nil {
		now = time.Now
	}
	h := handlers{presign: presign, table: table, cfg: cfg, now: now}
	return []api.Route{
		{Method: http.MethodPost, Pattern: "/notebook/images/upload-url", Auth: api.Notebook, Metric: "NotebookImageUploadUrl", Handler: h.uploadURL},
		{Method: http.MethodGet, Pattern: "/notebook/images/:name", Auth: api.Notebook, Metric: "NotebookImageUrl", Handler: h.imageURL},
		{Method: http.MethodPut, Pattern: "/notebook/images/objects/:key+", Auth: api.Notebook, Metric: "NotebookImagePutObject", Handler: h.putObject},
	}
}

type handlers struct {
	presign *s3.PresignClient
	table   *data.Table
	cfg     Config
	now     func() time.Time
}

func objectKey(userID, name string) string {
	return "images/" + userID + "/" + name
}

// newName is <16 hex>.<ext>: 64 random bits, unguessable but short in the note.
func newName(contentType string) string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:]) + "." + extByType[contentType]
}

func (h handlers) configured() error {
	if h.cfg.Bucket == "" {
		return &api.ServiceUnavailableError{Message: "Notebook images are not configured"}
	}
	return nil
}

type uploadURLResponse struct {
	UploadURL string            `json:"uploadUrl"`
	Src       string            `json:"src"`
	Headers   map[string]string `json:"headers"`
	ExpiresAt string            `json:"expiresAt"`
}

func (h handlers) uploadURL(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	contentType, _ := v.Enum("contentType", true, limits.MediaContentTypes...)
	contentLength, _ := v.Int("contentLength", true, api.Positive, api.MaxInt(limits.MediaMaxBytes))
	if err := v.Err(); err != nil {
		return nil, err
	}
	if err := h.configured(); err != nil {
		return nil, err
	}
	now := h.now()
	ok, err := store.TryIncrement(ctx, h.table, keys.RateNotebookImageUserPk(r.UserID()), keys.RateDaySk(now),
		contract.Data.API.NotebookImageUploadsPerUserPerDay, keys.TTLEndOfUTCDay(now))
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, &api.RateLimitedError{Message: "Too many image uploads today. Try again tomorrow."}
	}
	name := newName(contentType)
	key := objectKey(r.UserID(), name)
	res := uploadURLResponse{
		Src:       srcPrefix + name,
		Headers:   map[string]string{"Content-Type": contentType},
		ExpiresAt: jstime.ISO(now.Add(uploadTTL)),
	}
	if h.cfg.Filesystem {
		res.UploadURL = strings.TrimSuffix(h.cfg.LocalOrigin, "/") + "/api/notebook/images/objects/" + url.QueryEscape(key)
		return api.JSON(http.StatusOK, res), nil
	}
	signed, err := h.presign.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(h.cfg.Bucket),
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

type imageURLResponse struct {
	URL       string `json:"url"`
	ExpiresAt string `json:"expiresAt"`
}

func (h handlers) imageURL(ctx context.Context, r *api.Request) (*api.Response, error) {
	v := api.NewQueryValidator(map[string]string{"name": r.Params["name"]})
	name, _ := v.String("name", true, false, func(s string) string {
		if !namePattern.MatchString(s) {
			return api.CodeInvalidFormat
		}
		return ""
	})
	if err := v.ErrWith("Invalid path parameters"); err != nil {
		return nil, err
	}
	if err := h.configured(); err != nil {
		return nil, err
	}
	key := objectKey(r.UserID(), name)
	expires := jstime.ISO(h.now().Add(readTTL))
	if h.cfg.Filesystem {
		body, err := os.ReadFile(filepath.Join(h.cfg.Bucket, key))
		if errors.Is(err, os.ErrNotExist) {
			return nil, api.NotFound("Image not found")
		}
		if err != nil {
			return nil, err
		}
		contentType := typeByExt[namePattern.FindStringSubmatch(name)[1]]
		return api.JSON(http.StatusOK, imageURLResponse{
			URL:       "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(body),
			ExpiresAt: expires,
		}), nil
	}
	// No existence check: the key is under the caller's own prefix, and a
	// missing object is S3's 403 when the browser loads it.
	signed, err := h.presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(h.cfg.Bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(readTTL))
	if err != nil {
		return nil, err
	}
	return api.JSON(http.StatusOK, imageURLResponse{URL: signed.URL, ExpiresAt: expires}), nil
}

func (h handlers) putObject(_ context.Context, r *api.Request) (*api.Response, error) {
	if !h.cfg.Filesystem || h.cfg.Bucket == "" {
		return nil, api.NotFound("Local image PUT is only available in filesystem mode")
	}
	expected, err := strconv.ParseFloat(strings.TrimSpace(r.Headers["content-length"]), 64)
	if err != nil || expected < 1 {
		return nil, api.BadRequest("Content-Length required", nil)
	}
	key := r.Params["key"]
	if !localKeyPattern.MatchString(key) {
		return nil, api.BadRequest("Invalid image key", nil)
	}
	if float64(len(r.Body)) != expected {
		return nil, api.BadRequest(fmt.Sprintf("Content-Length mismatch: expected %v, got %d", expected, len(r.Body)), nil)
	}
	dest := filepath.Join(h.cfg.Bucket, key)
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return nil, err
	}
	if err := os.WriteFile(dest, r.Body, 0o644); err != nil {
		return nil, err
	}
	return &api.Response{Status: http.StatusNoContent}, nil
}

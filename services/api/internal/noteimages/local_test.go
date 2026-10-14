package noteimages

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/data/datatest"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
)

const localKey = "images/u1/0123456789abcdef.png"

func localPut(h handlers, length, body string) error {
	_, err := h.putObject(context.Background(), &api.Request{
		Headers: map[string]string{"content-length": length},
		Params:  map[string]string{"key": localKey},
		Body:    []byte(body),
	})
	return err
}

func TestLocalPutRejectsABodyShorterThanItsContentLength(t *testing.T) {
	dir := t.TempDir()
	err := localPut(handlers{cfg: Config{Bucket: dir, Filesystem: true}}, "5", "abc")
	var bad *api.BadRequestError
	if !errors.As(err, &bad) {
		t.Fatalf("err = %v, want a BadRequestError", err)
	}
	if _, err := os.Stat(filepath.Join(dir, localKey)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stat = %v, want nothing written", err)
	}
}

func TestLocalPutIsNotFoundWithoutFilesystemStorage(t *testing.T) {
	err := localPut(handlers{cfg: Config{Bucket: "bucket"}}, "3", "abc")
	var notFound *api.NotFoundError
	if !errors.As(err, &notFound) {
		t.Fatalf("err = %v, want a NotFoundError", err)
	}
}

func TestEveryImageTypeReadsBackAsItsType(t *testing.T) {
	for contentType, ext := range extByType {
		if got := typeByExt[ext]; got != contentType {
			t.Errorf("%s: typeByExt = %q, want %q", ext, got, contentType)
		}
	}
	if len(typeByExt) != len(extByType) {
		t.Errorf("typeByExt has %d types, extByType %d", len(typeByExt), len(extByType))
	}
}

func TestUploadURLIsRateLimitedPerUser(t *testing.T) {
	f := &datatest.Fake{}
	var counted []string
	f.UpdateItemFn = func(in *dynamodb.UpdateItemInput) (*dynamodb.UpdateItemOutput, error) {
		counted = append(counted, in.Key["pk"].(*types.AttributeValueMemberS).Value)
		return nil, &types.ConditionalCheckFailedException{Message: aws.String("at cap")}
	}
	h := handlers{table: &data.Table{DB: f, Name: "test"}, cfg: Config{Bucket: t.TempDir(), Filesystem: true}, now: time.Now}
	_, err := h.uploadURL(context.Background(), &api.Request{
		Body:   []byte(`{"contentType":"image/png","contentLength":3}`),
		Claims: map[string]string{"sub": "u1"},
	})
	var limited *api.RateLimitedError
	if !errors.As(err, &limited) {
		t.Fatalf("err = %v, want a RateLimitedError", err)
	}
	if len(counted) != 1 || counted[0] != keys.RateNotebookImageUserPk("u1") {
		t.Fatalf("counted = %v, want the caller's counter", counted)
	}
}

package restoretest

import (
	"context"
	"regexp"
	"strings"
	"time"

	"github.com/gagnechris/gagnechris/go/internal/contract"
)

// A leftover scratch table is a full copy of prod, private notes included,
// with no deletion protection, PITR or Backup.

const DefaultLeftoverMaxAge = 24 * time.Hour

var manualRestoreName = regexp.MustCompile(`^gagnechris-[a-z0-9]+-(?:backup-)?restore-.+`)

func IsRestoreScratchTableName(name string) bool {
	prefix := contract.Data.RestoreTest.TablePrefix
	return (strings.HasPrefix(name, prefix) && len(name) > len(prefix)) || manualRestoreName.MatchString(name)
}

type ListTablesPage struct {
	TableNames             []string
	LastEvaluatedTableName string
}

type LeftoverDeps struct {
	ListTables func(ctx context.Context, exclusiveStartTableName string) (ListTablesPage, error)
	// Zero when the table no longer exists.
	DescribeCreation func(ctx context.Context, tableName string) (time.Time, error)
}

type LeftoverTable struct {
	TableName string `json:"tableName"`
	AgeHours  int    `json:"ageHours"`
}

func FindLeftoverRestoreTables(ctx context.Context, d LeftoverDeps, now time.Time, maxAge time.Duration) ([]LeftoverTable, error) {
	var candidates []string
	start := ""
	for {
		page, err := d.ListTables(ctx, start)
		if err != nil {
			return nil, err
		}
		for _, name := range page.TableNames {
			if IsRestoreScratchTableName(name) {
				candidates = append(candidates, name)
			}
		}
		start = page.LastEvaluatedTableName
		if start == "" {
			break
		}
	}

	leftovers := []LeftoverTable{}
	for _, name := range candidates {
		created, err := d.DescribeCreation(ctx, name)
		if err != nil {
			return nil, err
		}
		if created.IsZero() {
			continue
		}
		if age := now.Sub(created); age >= maxAge {
			leftovers = append(leftovers, LeftoverTable{TableName: name, AgeHours: int(age / time.Hour)})
		}
	}
	return leftovers, nil
}

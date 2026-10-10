package restoretest

import (
	"context"
	"slices"
	"testing"
	"time"
)

func TestMatchesOnlyRestoreScratchNames(t *testing.T) {
	for _, name := range []string{
		"awsbackup-restore-test-1a2b",
		"gagnechris-prod-restore-20261002130416",
		"gagnechris-prod-backup-restore-20261003",
		"gagnechris-local-restore-notes",
	} {
		if !IsRestoreScratchTableName(name) {
			t.Errorf("%s should match", name)
		}
	}
	for _, name := range []string{
		"gagnechris-prod",
		"gagnechris-local",
		"gagnechris-it-notes-1234",
		"other-restore-table",
		"awsbackup-restore-test-",
	} {
		if IsRestoreScratchTableName(name) {
			t.Errorf("%s should not match", name)
		}
	}
}

func TestPagesListTablesAndReportsTablesPastTheAgeLimit(t *testing.T) {
	now := time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)
	ago := func(h int) time.Time { return now.Add(-time.Duration(h) * time.Hour) }
	pages := []ListTablesPage{
		{TableNames: []string{"gagnechris-prod", "awsbackup-restore-test-old"}, LastEvaluatedTableName: "awsbackup-restore-test-old"},
		{TableNames: []string{"awsbackup-restore-test-fresh", "gagnechris-prod-restore-20261001", "gagnechris-prod-restore-gone"}},
	}
	created := map[string]time.Time{
		"awsbackup-restore-test-old":       ago(30),
		"awsbackup-restore-test-fresh":     ago(2),
		"gagnechris-prod-restore-20261001": ago(48),
	}
	var described []string
	leftovers, err := FindLeftoverRestoreTables(context.Background(), LeftoverDeps{
		ListTables: func(_ context.Context, start string) (ListTablesPage, error) {
			if start != "" {
				return pages[1], nil
			}
			return pages[0], nil
		},
		DescribeCreation: func(_ context.Context, name string) (time.Time, error) {
			described = append(described, name)
			return created[name], nil
		},
	}, now, 24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	want := []LeftoverTable{
		{TableName: "awsbackup-restore-test-old", AgeHours: 30},
		{TableName: "gagnechris-prod-restore-20261001", AgeHours: 48},
	}
	if !slices.Equal(leftovers, want) {
		t.Errorf("leftovers = %+v", leftovers)
	}
	if slices.Contains(described, "gagnechris-prod") {
		t.Error("described the live table")
	}
}

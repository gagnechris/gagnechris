// Package contract exposes what Go shares with the TypeScript packages,
// generated from them by scripts/generate-go-contract.ts (npm run go:generate).
package contract

import (
	_ "embed"
	"encoding/json"
)

//go:embed contract.json
var raw []byte

type RestoreTestMetrics struct {
	ValidationSucceeded    string `json:"validationSucceeded"`
	ValidationFailed       string `json:"validationFailed"`
	LeftoverTables         string `json:"leftoverTables"`
	StaleRecoveryPoint     string `json:"staleRecoveryPoint"`
	ValidationMissing      string `json:"validationMissing"`
	AdvancedBackupDisabled string `json:"advancedBackupDisabled"`
	BackupCheckCompleted   string `json:"backupCheckCompleted"`
}

type RestoreTest struct {
	ServiceName              string             `json:"serviceName"`
	MetricsNamespace         string             `json:"metricsNamespace"`
	Metrics                  RestoreTestMetrics `json:"metrics"`
	TablePrefix              string             `json:"tablePrefix"`
	SchemaCheckedEntityTypes []string           `json:"schemaCheckedEntityTypes"`
	CountFloorEntityTypes    []string           `json:"countFloorEntityTypes"`
	SourceCountAttributes    []string           `json:"sourceCountAttributes"`
}

type API struct {
	ServiceName         string `json:"serviceName"`
	MetricsNamespace    string `json:"metricsNamespace"`
	ApexDomain          string `json:"apexDomain"`
	ContactPerIPPerHour int    `json:"contactPerIpPerHour"`
	SESGlobalDailyCap   int    `json:"sesGlobalDailyCap"`
	MinContactSubmitMs  int64  `json:"minContactSubmitMs"`
}

type Contract struct {
	API         API         `json:"api"`
	RestoreTest RestoreTest `json:"restoreTest"`
	// Keys maps a TypeScript key builder call with {placeholder} arguments to
	// the key it returns.
	Keys        map[string]string          `json:"keys"`
	ItemSchemas map[string]json.RawMessage `json:"itemSchemas"`
	// Samples are rows built by the TypeScript item builders.
	Samples map[string]map[string]any `json:"samples"`
	// APISamples are API response bodies built by the TypeScript converters.
	APISamples map[string]json.RawMessage `json:"apiSamples"`
}

// Data is the generated contract.
var Data = mustLoad()

func mustLoad() Contract {
	var c Contract
	if err := json.Unmarshal(raw, &c); err != nil {
		panic("contract.json: " + err.Error())
	}
	return c
}

// Sample returns a deep copy of a sample row, safe to modify.
func Sample(name string) map[string]any {
	item, ok := Data.Samples[name]
	if !ok {
		panic("no contract sample " + name)
	}
	b, err := json.Marshal(item)
	if err != nil {
		panic(err)
	}
	var out map[string]any
	if err := json.Unmarshal(b, &out); err != nil {
		panic(err)
	}
	return out
}

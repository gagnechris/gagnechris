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

type APIMetrics struct {
	HandlerError                   string `json:"handlerError"`
	DataIntegrityError             string `json:"dataIntegrityError"`
	WriteConflict                  string `json:"writeConflict"`
	SyncAdapterMissing             string `json:"syncAdapterMissing"`
	SyncCorruptRow                 string `json:"syncCorruptRow"`
	ContactEmailFailed             string `json:"contactEmailFailed"`
	ContactEmailStatusUpdateFailed string `json:"contactEmailStatusUpdateFailed"`
	SESCapReached                  string `json:"sesCapReached"`
	NotFound                       string `json:"notFound"`
	MethodNotAllowed               string `json:"methodNotAllowed"`
}

type API struct {
	ServiceName                       string     `json:"serviceName"`
	MetricsNamespace                  string     `json:"metricsNamespace"`
	ApexDomain                        string     `json:"apexDomain"`
	ContactPerIPPerHour               int        `json:"contactPerIpPerHour"`
	SESGlobalDailyCap                 int        `json:"sesGlobalDailyCap"`
	ResumeNotifySESDailyCap           int        `json:"resumeNotifySesDailyCap"`
	MinContactSubmitMs                int64      `json:"minContactSubmitMs"`
	NotebookImageUploadsPerUserPerDay int        `json:"notebookImageUploadsPerUserPerDay"`
	Metrics                           APIMetrics `json:"metrics"`
}

type GSINames struct {
	GSI1 string `json:"gsi1"`
	GSI2 string `json:"gsi2"`
	GSI3 string `json:"gsi3"`
}

type Limits struct {
	MaxSlugLength             int      `json:"maxSlugLength"`
	LinkHrefMaxLength         int      `json:"linkHrefMaxLength"`
	PostLinkSchemes           []string `json:"postLinkSchemes"`
	ProjectHrefSchemes        []string `json:"projectHrefSchemes"`
	ProjectNameMaxLength      int      `json:"projectNameMaxLength"`
	ProjectPitchMaxLength     int      `json:"projectPitchMaxLength"`
	ProjectStageNoteMaxLength int      `json:"projectStageNoteMaxLength"`
	ProjectStackMax           int      `json:"projectStackMax"`
	ProjectStackItemMaxLength int      `json:"projectStackItemMaxLength"`
	ProjectLinksMax           int      `json:"projectLinksMax"`
	ProjectLinkLabelMaxLength int      `json:"projectLinkLabelMaxLength"`
	ProjectOrderMax           int64    `json:"projectOrderMax"`
	ProjectDemoIDs            []string `json:"projectDemoIds"`
	PageLimitMax              int64    `json:"pageLimitMax"`
	PostProjectIDsMax         int      `json:"postProjectIdsMax"`
	PostSearchMaxLength       int      `json:"postSearchMaxLength"`
	PostsPageSize             int      `json:"postsPageSize"`
	MediaMaxBytes             int64    `json:"mediaMaxBytes"`
	MediaContentTypes         []string `json:"mediaContentTypes"`
	MediaFilenameMaxLength    int      `json:"mediaFilenameMaxLength"`
	ContactNameMaxLength      int      `json:"contactNameMaxLength"`
	ContactEmailMaxLength     int      `json:"contactEmailMaxLength"`
	ContactMessageMaxLength   int      `json:"contactMessageMaxLength"`
	ContactHoneypotMaxLength  int      `json:"contactHoneypotMaxLength"`
	ResumeReferrerMaxLength   int      `json:"resumeReferrerMaxLength"`
	ResumeYearMin             int64    `json:"resumeYearMin"`
	ResumeYearMax             int64    `json:"resumeYearMax"`
	ManagedUserIDMaxLength    int      `json:"managedUserIdMaxLength"`
	UserEmailMaxLength        int      `json:"userEmailMaxLength"`
	UserNameMaxLength         int      `json:"userNameMaxLength"`
}

type Defaults struct {
	Home   json.RawMessage `json:"home"`
	Resume json.RawMessage `json:"resume"`
}

type Groups struct {
	SiteAdmin string `json:"siteAdmin"`
	Notebook  string `json:"notebook"`
	UserAdmin string `json:"userAdmin"`
}

type LevelCase struct {
	Groups []string `json:"groups"`
	Level  *string  `json:"level"`
}

type Users struct {
	// AccessGroups is ordered: Full Admin is all of them.
	AccessGroups []string `json:"accessGroups"`
	Groups       Groups   `json:"groups"`
	// AccessLevels is ordered from the most access to the least.
	AccessLevels      []string            `json:"accessLevels"`
	AccessLevelGroups map[string][]string `json:"accessLevelGroups"`
	// LevelCases are group sets with accessLevelFromGroups' answer.
	LevelCases     []LevelCase `json:"levelCases"`
	ReauthSeconds  int64       `json:"reauthSeconds"`
	ReauthRequired string      `json:"reauthRequired"`
}

type Notebook struct {
	TextMaxBytes                int               `json:"textMaxBytes"`
	TitleMaxLength              int               `json:"titleMaxLength"`
	TagMaxLength                int               `json:"tagMaxLength"`
	TagsMax                     int               `json:"tagsMax"`
	BatchMaxIDs                 int               `json:"batchMaxIds"`
	PageSize                    int               `json:"pageSize"`
	SearchMaxLength             int               `json:"searchMaxLength"`
	SearchLimitMax              int64             `json:"searchLimitMax"`
	DailyTemplates              map[string]string `json:"dailyTemplates"`
	DailyTemplateMaxBytes       int               `json:"dailyTemplateMaxBytes"`
	DailyTemplateTaskMessage    string            `json:"dailyTemplateTaskMessage"`
	DailyTemplateSectionMessage string            `json:"dailyTemplateSectionMessage"`
}

type Sync struct {
	ChangeTypes         []string `json:"changeTypes"`
	DefaultPageLimit    int      `json:"defaultPageLimit"`
	MinClientVersion    string   `json:"minClientVersion"`
	ClientVersionHeader string   `json:"clientVersionHeader"`
	TombstoneTTLDays    int      `json:"tombstoneTtlDays"`
	CreateClaimTTLDays  int      `json:"createClaimTtlDays"`
	ResyncMarginMs      int64    `json:"resyncMarginMs"`
	OverlapMs           int64    `json:"overlapMs"`
}

type Contract struct {
	API         API         `json:"api"`
	RestoreTest RestoreTest `json:"restoreTest"`
	GSINames    GSINames    `json:"gsiNames"`
	// Keys maps a TypeScript key builder call with {placeholder} arguments to
	// the key it returns.
	Keys        map[string]string          `json:"keys"`
	Limits      Limits                     `json:"limits"`
	Defaults    Defaults                   `json:"defaults"`
	Notebook    Notebook                   `json:"notebook"`
	Sync        Sync                       `json:"sync"`
	Users       Users                      `json:"users"`
	ItemSchemas map[string]json.RawMessage `json:"itemSchemas"`
	// Samples are rows built by the TypeScript item builders.
	Samples map[string]map[string]any `json:"samples"`
	// APISamples are API response bodies built by the TypeScript converters.
	APISamples map[string]json.RawMessage `json:"apiSamples"`
	// TextCases are inputs with the TypeScript text helpers' outputs.
	TextCases map[string][]TextCase `json:"textCases"`
}

type TextCase struct {
	Input json.RawMessage `json:"input"`
	Want  json.RawMessage `json:"want"`
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

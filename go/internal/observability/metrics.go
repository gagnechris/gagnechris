package observability

import (
	"encoding/json"
	"io"
	"os"
	"sync"
	"time"
)

// Unit is a CloudWatch metric unit.
type Unit string

const (
	Count        Unit = "Count"
	Milliseconds Unit = "Milliseconds"
)

type metric struct {
	unit   Unit
	values []float64
}

// Metrics buffers values and writes them as one CloudWatch Embedded Metric
// Format line, in the namespace and with the single `service` dimension that
// Powertools Metrics uses, which is what the alarms in infra select on.
type Metrics struct {
	w         io.Writer
	namespace string
	service   string
	now       func() time.Time

	mu      sync.Mutex
	order   []string
	metrics map[string]*metric
}

func NewMetrics(w io.Writer, namespace, service string) *Metrics {
	return &Metrics{
		w:         w,
		namespace: namespace,
		service:   service,
		now:       time.Now,
		metrics:   map[string]*metric{},
	}
}

// MetricsFromEnv is NewMetrics on stdout for the namespace and service the
// function's environment names.
func MetricsFromEnv() *Metrics {
	return NewMetrics(os.Stdout, os.Getenv(namespaceEnv), os.Getenv(serviceEnv))
}

// Add records a value; adding the same name again publishes both values.
func (m *Metrics) Add(name string, unit Unit, value float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	entry, ok := m.metrics[name]
	if !ok {
		entry = &metric{unit: unit}
		m.metrics[name] = entry
		m.order = append(m.order, name)
	}
	entry.values = append(entry.values, value)
}

// Flush writes the buffered metrics and clears them. It writes nothing when
// no metric was added.
func (m *Metrics) Flush() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.order) == 0 {
		return nil
	}

	type definition struct {
		Name string `json:"Name"`
		Unit Unit   `json:"Unit"`
	}
	defs := make([]definition, 0, len(m.order))
	doc := map[string]any{"service": m.service}
	for _, name := range m.order {
		entry := m.metrics[name]
		defs = append(defs, definition{Name: name, Unit: entry.unit})
		if len(entry.values) == 1 {
			doc[name] = entry.values[0]
		} else {
			doc[name] = entry.values
		}
	}
	doc["_aws"] = map[string]any{
		"Timestamp": m.now().UnixMilli(),
		"CloudWatchMetrics": []map[string]any{{
			"Namespace":  m.namespace,
			"Dimensions": [][]string{{"service"}},
			"Metrics":    defs,
		}},
	}

	line, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	m.order = nil
	m.metrics = map[string]*metric{}
	_, err = m.w.Write(append(line, '\n'))
	return err
}

package platform

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"denova/internal/agents/canonicalstore"
	agent "github.com/alfredxw/denova/agent"
)

// Loaded through a Go overlay: this test never edits the Denova checkout.
func TestIndexRuntimeExamples(t *testing.T) {
	root := os.Getenv("DENOVA_INDEX_REPO")
	if root == "" {
		t.Skip("Set DENOVA_INDEX_REPO")
	}
	m, projectID := testManager(t)
	store, err := canonicalstore.New(m.root, m.registry)
	if err != nil {
		t.Fatal(err)
	}
	model := &platformTestModel{}
	m.ConfigureAgents(store, func(context.Context, string) (agent.BaseChatModel, agent.CapabilityIdentity, error) {
		return model, agent.CapabilityIdentity{Kind: "index.fixture", Version: 1}, nil
	})
	candidate, err := m.PreviewDirectory(Game, filepath.Join(root, "examples", "extension-starter", "small-circle"))
	if err != nil {
		t.Fatal(err)
	}
	release := testInstall(t, m, candidate)
	instance, err := m.CreateInstance(CreateInstance{GameID: release.Manifest.ID, ReleaseID: release.Ref.ReleaseID, Title: "Index validation", ProjectID: projectID, Models: map[string]string{"local:chat": "test"}})
	if err != nil {
		t.Fatal(err)
	}
	var opened RuntimeSnapshot
	parent := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/bootstrap" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(opened)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<!doctype html><meta charset="utf-8"><style>body{margin:0}iframe{border:0;width:100%;height:100vh}</style><iframe title="Game"></iframe><script>
const frame=document.querySelector('iframe');
fetch('/bootstrap').then(r=>r.json()).then(b=>{
  window.addEventListener('message',e=>{
    if(e.source!==frame.contentWindow||e.origin!==new URL(b.viewUrl).origin||e.data.type!=='denova:ready')return;
    frame.contentWindow.postMessage({type:'denova:bootstrap',nonce:e.data.nonce,connection:b.connection,context:b.context},e.origin);
  });
  frame.src=b.viewUrl;
});
</script>`))
	}))
	defer parent.Close()
	opened, err = m.OpenInstance(context.Background(), instance.ID, OpenOptions{ParentOrigin: parent.URL, Locale: "zh-CN", Theme: "light"})
	if err != nil {
		t.Fatal(err)
	}
	input, _ := json.Marshal(map[string]string{"url": parent.URL})
	command := exec.Command("node", filepath.Join(root, "scripts", "denova-browser.mjs"))
	command.Dir = root
	command.Stdin = strings.NewReader(string(input))
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("browser: %v\n%s", err, output)
	}
	t.Log(string(output))
	if model.calls.Load() != 2 {
		t.Fatalf("expected exactly two model calls, got %d", model.calls.Load())
	}
	plugin, err := m.PreviewDirectory(Plugin, filepath.Join(root, "examples", "extension-starter", "text-statistics"))
	if err != nil {
		t.Fatal(err)
	}
	installed := testInstall(t, m, plugin)
	runtime, err := m.ActivatePlugin(context.Background(), ActivatePlugin{PluginID: installed.Manifest.ID, ReleaseID: installed.Ref.ReleaseID, Scope: Scope{Kind: "project", ProjectID: projectID}, OpenOptions: OpenOptions{ParentOrigin: parent.URL}})
	if err != nil {
		t.Fatal(err)
	}
	status, body := testRequest(t, runtime.Connection, "POST", "/tools/index.text-statistics/statistics/invoke", "", map[string]any{"input": map[string]string{"text": "Hello world.\n\nGood night!"}})
	if status != 200 {
		t.Fatalf("statistics %d: %s", status, body)
	}
	var result struct {
		Data map[string]int `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatal(err)
	}
	if result.Data["wordSegments"] != 4 || result.Data["paragraphs"] != 2 {
		t.Fatalf("statistics: %s", body)
	}
	t.Log("Verified real runtime view, Agent sessions, comments, save reload, and Node plugin execution")
}

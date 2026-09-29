package resourceexchange

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"denova/internal/book/lore"
	"denova/internal/interactive"
	"denova/internal/project"
)

// Verify the installed projection, including material IDs rewritten by import.
func TestIndexCultivationMaterials(t *testing.T) {
	dir := os.Getenv("DENOVA_INDEX_EXAMPLES_DIR")
	if dir == "" {
		t.Skip("Set DENOVA_INDEX_EXAMPLES_DIR")
	}
	ctx := context.Background()
	s := testService(t)
	workspace := filepath.Join(s.root, "projects", "cultivation")
	if err := os.MkdirAll(workspace, 0700); err != nil {
		t.Fatal(err)
	}
	book, err := s.registry.Add(workspace, project.TypeBook, "Cultivation")
	if err != nil {
		t.Fatal(err)
	}
	files, err := readFiles(filepath.Join(dir, "cultivation-starter"))
	if err != nil {
		t.Fatal(err)
	}
	raw, err := archiveBytes(files)
	if err != nil {
		t.Fatal(err)
	}
	preview, err := s.Preview(ctx, Source{Kind: "file", Filename: "cultivation.zip"}, raw)
	if err != nil {
		t.Fatal(err)
	}
	candidate := preview.Candidates[0]
	plan, err := s.Plan(ctx, PlanRequest{PreviewID: preview.ID, CandidateID: candidate.ID, Resources: []string{"lore", "openings"}, ProjectID: book.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Apply(ctx, plan.ID); err != nil {
		t.Fatal(err)
	}
	_, layout, err := s.registry.Resolve(book.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	items, err := lore.NewStore(layout.ContentRoot).List()
	if err != nil {
		t.Fatal(err)
	}
	var candidates []string
	var portraits []string
	backgrounds := 0
	seenOtherCharacter := false
	for _, item := range items {
		if item.Type == "character" {
			if slices.Contains(item.Tags, "主角") {
				if seenOtherCharacter || item.Importance != "major" || item.LoadMode != "auto" {
					t.Fatalf("recommended character not prioritized correctly: %s", item.Name)
				}
				candidates = append(candidates, item.Name)
			} else {
				seenOtherCharacter = true
			}
		}
		if len(item.ResolvedMaterials) == 0 {
			continue
		}
		if len(item.ResolvedMaterials) != 1 || item.Materials == nil || item.Image == nil {
			t.Fatalf("missing material cover: %s", item.Name)
		}
		material := item.ResolvedMaterials[0]
		if item.Materials.CoverAssetID != material.ID || item.Image.ImagePath != material.Path {
			t.Fatalf("cover does not resolve to the imported image: %s", item.Name)
		}
		if _, err := os.Stat(filepath.Join(layout.ContentRoot, filepath.FromSlash(material.Path))); err != nil {
			t.Fatal(err)
		}
		if item.Type == "character" {
			portraits = append(portraits, item.Name)
		} else if item.Name == "照夜长河" {
			backgrounds++
			patch, _ := json.Marshal(map[string]any{"background": map[string]string{"item_id": item.ID, "asset_id": material.ID}})
			stage, receipt := interactive.ResolvePresentationPatch(layout.ContentRoot, nil, patch, nil)
			if receipt.Ignored != 0 || stage == nil || stage.Background == nil || stage.Background.Path != material.Path {
				t.Fatalf("imported background is not usable for story presentation: %#v", receipt)
			}
		}
	}
	if len(candidates) != 6 || candidates[0] != "孟迟" {
		t.Fatalf("unexpected protagonist recommendations: %v", candidates)
	}
	slices.Sort(portraits)
	expected := []string{"陆照棠", "祝清砚", "阮绯舟", "柳听蝉", "花知宁", "苏晚禾", "裴照雪"}
	slices.Sort(expected)
	if !slices.Equal(portraits, expected) || backgrounds != 1 {
		t.Fatalf("unexpected portraits/backgrounds: %v / %d", portraits, backgrounds)
	}
}

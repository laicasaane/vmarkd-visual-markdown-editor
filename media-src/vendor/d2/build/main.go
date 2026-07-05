//go:build js && wasm

package main

import (
	"encoding/json"
	"strings"
	"syscall/js"

	"oss.terrastruct.com/d2/d2compiler"
	"oss.terrastruct.com/d2/d2graph"
)

type outShape struct {
	ID           string `json:"id"`
	IDVal        string `json:"idVal"`
	Label        string `json:"label"`
	Shape        string `json:"shape"`
	Container    string `json:"container,omitempty"`
	Fill         string `json:"fill,omitempty"`
	Stroke       string `json:"stroke,omitempty"`
	StrokeWidth  string `json:"strokeWidth,omitempty"`
	StrokeDash   string `json:"strokeDash,omitempty"`
	Opacity      string `json:"opacity,omitempty"`
	FontColor    string `json:"fontColor,omitempty"`
	BorderRadius string `json:"borderRadius,omitempty"`
	Bold         bool   `json:"bold,omitempty"`
	Italic       bool   `json:"italic,omitempty"`
	// Shape effects + text styling (task 159 export batch → consumers 121/129). Booleans mirror the
	// d2 scalar "true"; strings pass the raw d2 value through. Present in the JSON but not yet
	// consumed by the renderer (that lands in the per-feature consumer tasks).
	FillPattern   string `json:"fillPattern,omitempty"`   // dots|lines|grain|paper (task 121)
	Shadow        bool   `json:"shadow,omitempty"`        // task 121
	ThreeD        bool   `json:"threeD,omitempty"`        // style `3d` (task 121)
	Multiple      bool   `json:"multiple,omitempty"`      // task 121
	DoubleBorder  bool   `json:"doubleBorder,omitempty"`  // task 121
	Animated      bool   `json:"animated,omitempty"`      // animated on a SHAPE (edges already had it; task 121/135)
	Font          string `json:"font,omitempty"`          // task 129
	FontSize      string `json:"fontSize,omitempty"`      // task 129
	Underline     bool   `json:"underline,omitempty"`     // task 129
	TextTransform string `json:"textTransform,omitempty"` // uppercase|lowercase|capitalize|none (task 129)
	// Block-string language (task 154): "markdown" for |md| text shapes — the JS side renders
	// that label via Lute into a <foreignObject>. Code langs / "latex" pass through unchanged.
	Language string `json:"language,omitempty"`
	// Interaction + media (task 124 #3/#5). Tooltip/Link from o.Tooltip/o.Link; Icon = the image URL
	// (o.Icon) used as the picture for shape:image, or a decorative icon on any other shape.
	Tooltip string      `json:"tooltip,omitempty"`
	Link    string      `json:"link,omitempty"`
	Icon    string      `json:"icon,omitempty"`
	Columns []outColumn `json:"columns,omitempty"` // sql_table
	Fields  []outMember `json:"fields,omitempty"`  // class fields
	Methods []outMember `json:"methods,omitempty"` // class methods
	// Per-container layout direction (up|down|left|right), task 127. Empty = inherit.
	Direction string `json:"direction,omitempty"`
	// Explicit dimensions + absolute pin (task 159 → task 130). Raw d2 scalar px strings.
	Width  string `json:"width,omitempty"`
	Height string `json:"height,omitempty"`
	Top    string `json:"top,omitempty"`
	Left   string `json:"left,omitempty"`
	// Label / icon / tooltip placement keywords from `label.near` / `icon.near` / `tooltip.near`
	// (task 159 → task 134). The d2-resolved position keyword (e.g. outside-top-left); empty when
	// the source set none. Read from o.Attributes.* because o.LabelPosition/o.IconPosition are the
	// (nil, layout-resolved) *string that SHADOWS the embedded *Scalar source value.
	LabelPosition   string `json:"labelPosition,omitempty"`
	IconPosition    string `json:"iconPosition,omitempty"`
	TooltipPosition string `json:"tooltipPosition,omitempty"`
	// Decorative-icon style from icon.style.* (task 159 → task 134/135). Visual box props only — an
	// icon carries no text, so font/bold/etc are intentionally excluded. Nil when the icon has none.
	IconStyle *outStyle `json:"iconStyle,omitempty"`
	Special   special   `json:"special"`
}

type outColumn struct {
	Name       string `json:"name"`
	Type       string `json:"type,omitempty"`
	Constraint string `json:"constraint,omitempty"`
}

type outMember struct {
	Name       string `json:"name"`
	Type       string `json:"type,omitempty"` // field type / method return
	Visibility string `json:"visibility,omitempty"`
}

type special struct {
	IsSequence  bool   `json:"isSequence"`
	IsGrid      bool   `json:"isGrid"`
	GridRows    string `json:"gridRows,omitempty"`
	GridColumns string `json:"gridColumns,omitempty"`
	NearKey     string `json:"nearKey,omitempty"`
	// Grid spacing (task 159 → task 135). Raw d2 scalar px strings; empty = the grid default.
	GridGap       string `json:"gridGap,omitempty"`
	VerticalGap   string `json:"verticalGap,omitempty"`
	HorizontalGap string `json:"horizontalGap,omitempty"`
}

// outArrowhead = the shape + optional label of one end of an edge (task 128). Shape is the
// d2-resolved arrowhead string (triangle, diamond, filled-diamond, cf-many, …); label is the
// crow's-foot cardinality / role text (e.g. "1", "*", a role name).
type outArrowhead struct {
	Shape string `json:"shape"`
	Label string `json:"label,omitempty"`
}

type outEdge struct {
	Src      string `json:"src"`
	Dst      string `json:"dst"`
	Label    string `json:"label,omitempty"`
	SrcArrow bool   `json:"srcArrow"`
	DstArrow bool   `json:"dstArrow"`
	// Connection style (task 124 #1) from e.Style. Empty/false = the source set none → the renderer
	// keeps the theme default (themeColor / width 2). Shapes already carry these; edges didn't.
	Stroke      string `json:"stroke,omitempty"`
	StrokeWidth string `json:"strokeWidth,omitempty"`
	StrokeDash  string `json:"strokeDash,omitempty"`
	Opacity     string `json:"opacity,omitempty"`
	Animated    bool   `json:"animated,omitempty"`
	// Connection corner rounding (task 159 → task 135). e.Style.BorderRadius rounds the routed
	// path's bends; empty = the default. (Style.BorderRadius exists for edges too, not just shapes.)
	BorderRadius string `json:"borderRadius,omitempty"`
	// Connection LABEL text styling from e.Style (task 159 → task 129). Distinct from the line
	// stroke above: these style the edge's label text. Empty/false = the theme default.
	FontColor string `json:"fontColor,omitempty"`
	FontSize  string `json:"fontSize,omitempty"`
	Bold      bool   `json:"bold,omitempty"`
	Italic    bool   `json:"italic,omitempty"`
	Underline bool   `json:"underline,omitempty"`
	// Per-end arrowhead shape/label, only when the source set one (task 128). When nil the
	// renderer falls back to the SrcArrow/DstArrow boolean (default triangle / none).
	SrcArrowhead *outArrowhead `json:"srcArrowhead,omitempty"`
	DstArrowhead *outArrowhead `json:"dstArrowhead,omitempty"`
	// Column-level (sql_table) endpoints, task 133. When set, the edge attaches to that column's
	// row of the table node (d2 computes these indices at compile time; nil = a whole-node edge).
	SrcColumnIndex *int `json:"srcColumnIndex,omitempty"`
	DstColumnIndex *int `json:"dstColumnIndex,omitempty"`
}

type outGraph struct {
	Shapes   []outShape `json:"shapes"`
	Edges    []outEdge  `json:"edges"`
	Sequence bool       `json:"sequence"` // top-level OR nested sequence_diagram (root isn't in g.Objects)
	// Root layout direction (up|down|left|right), task 127. Empty = default (down). The root
	// object isn't in g.Objects, so this graph-level field carries the top-level `direction:`.
	Direction string `json:"direction,omitempty"`
	// Source-level `vars.d2-config` (task 159 → task 132). Nil when the source sets none.
	Config *outConfig `json:"config,omitempty"`
}

// outConfig mirrors the scalar fields of d2target.Config (source `vars.d2-config`) — the compile-side
// diagram config (task 159 → task 132). d2compiler.Compile returns it as its 2nd value (previously
// discarded). Theme-overrides + data (nested color/blob maps) are intentionally omitted: they're
// outside task 132's theme/sketch/pad/layout scope and cheap to add later (the toolchain is cached).
type outConfig struct {
	Sketch       *bool   `json:"sketch,omitempty"`
	ThemeID      *int64  `json:"themeID,omitempty"`
	DarkThemeID  *int64  `json:"darkThemeID,omitempty"`
	Pad          *int64  `json:"pad,omitempty"`
	Center       *bool   `json:"center,omitempty"`
	LayoutEngine *string `json:"layoutEngine,omitempty"`
}

func styleVal(s *d2graph.Scalar) string {
	if s == nil {
		return ""
	}
	return s.Value
}

// outStyle is the compact visual-style representation for a NESTED style — currently only a shape's
// decorative iconStyle (task 159 → task 134/135). Shape/edge styles are flattened directly onto
// their out* struct (the pre-existing contract the renderer already reads); this exists so
// icon.style.* can be exported without duplicating that flattening. Text props (font/bold/…) are
// excluded because an icon is an image, not text.
type outStyle struct {
	Fill         string `json:"fill,omitempty"`
	Stroke       string `json:"stroke,omitempty"`
	StrokeWidth  string `json:"strokeWidth,omitempty"`
	StrokeDash   string `json:"strokeDash,omitempty"`
	Opacity      string `json:"opacity,omitempty"`
	BorderRadius string `json:"borderRadius,omitempty"`
	FillPattern  string `json:"fillPattern,omitempty"`
	Shadow       bool   `json:"shadow,omitempty"`
	Multiple     bool   `json:"multiple,omitempty"`
	ThreeD       bool   `json:"threeD,omitempty"`
	DoubleBorder bool   `json:"doubleBorder,omitempty"`
}

// toOutStyle mirrors a d2graph.Style into outStyle, returning nil when nothing is set so the
// pointer field drops out under omitempty (task 159, used for iconStyle).
func toOutStyle(s d2graph.Style) *outStyle {
	os := outStyle{
		Fill:         styleVal(s.Fill),
		Stroke:       styleVal(s.Stroke),
		StrokeWidth:  styleVal(s.StrokeWidth),
		StrokeDash:   styleVal(s.StrokeDash),
		Opacity:      styleVal(s.Opacity),
		BorderRadius: styleVal(s.BorderRadius),
		FillPattern:  styleVal(s.FillPattern),
		Shadow:       styleVal(s.Shadow) == "true",
		Multiple:     styleVal(s.Multiple) == "true",
		ThreeD:       styleVal(s.ThreeDee) == "true",
		DoubleBorder: styleVal(s.DoubleBorder) == "true",
	}
	if os == (outStyle{}) {
		return nil
	}
	return &os
}

func compileToJSON(src string) (string, error) {
	// cfg = the 2nd return value = compiled `vars.d2-config` (task 159 → 132); was discarded before.
	g, cfg, err := d2compiler.Compile("index", strings.NewReader(src), &d2compiler.CompileOptions{})
	if err != nil {
		return "", err
	}
	og := outGraph{}
	if cfg != nil {
		oc := outConfig{
			Sketch:       cfg.Sketch,
			ThemeID:      cfg.ThemeID,
			DarkThemeID:  cfg.DarkThemeID,
			Pad:          cfg.Pad,
			Center:       cfg.Center,
			LayoutEngine: cfg.LayoutEngine,
		}
		if oc != (outConfig{}) { // drop an empty `vars.d2-config: {}` so `config` stays omitted
			og.Config = &oc
		}
	}
	for _, o := range g.Objects {
		container := ""
		if o.Parent != nil && o.Parent.ID != "" {
			container = o.Parent.AbsID()
		}
		sp := special{
			IsSequence:    o.IsSequenceDiagram(),
			IsGrid:        o.IsGridDiagram(),
			GridRows:      styleVal(o.GridRows),
			GridColumns:   styleVal(o.GridColumns),
			GridGap:       styleVal(o.GridGap),       // task 159 → 135
			VerticalGap:   styleVal(o.VerticalGap),   // task 159 → 135
			HorizontalGap: styleVal(o.HorizontalGap), // task 159 → 135
		}
		if o.NearKey != nil {
			sp.NearKey = strings.Join(d2graph.Key(o.NearKey), ".")
		}
		icon := "" // o.Icon is a *url.URL — the image for shape:image, or a decorative icon (task 124 #3)
		if o.Icon != nil {
			icon = o.Icon.String()
		}
		sh := outShape{
			ID:           o.AbsID(),
			IDVal:        o.IDVal,
			Label:        o.Label.Value,
			Shape:        o.Shape.Value,
			Container:    container,
			Fill:         styleVal(o.Style.Fill),
			Stroke:       styleVal(o.Style.Stroke),
			StrokeWidth:  styleVal(o.Style.StrokeWidth),
			StrokeDash:   styleVal(o.Style.StrokeDash),
			Opacity:      styleVal(o.Style.Opacity),
			FontColor:    styleVal(o.Style.FontColor),
			BorderRadius: styleVal(o.Style.BorderRadius),
			Bold:         styleVal(o.Style.Bold) == "true",
			Italic:       styleVal(o.Style.Italic) == "true",
			// Shape effects + text styling (task 159 → 121/129).
			FillPattern:   styleVal(o.Style.FillPattern),
			Shadow:        styleVal(o.Style.Shadow) == "true",
			ThreeD:        styleVal(o.Style.ThreeDee) == "true",
			Multiple:      styleVal(o.Style.Multiple) == "true",
			DoubleBorder:  styleVal(o.Style.DoubleBorder) == "true",
			Animated:      styleVal(o.Style.Animated) == "true",
			Font:          styleVal(o.Style.Font),
			FontSize:      styleVal(o.Style.FontSize),
			Underline:     styleVal(o.Style.Underline) == "true",
			TextTransform: styleVal(o.Style.TextTransform),
			Language:      o.Language,          // task 154 (|md| → "markdown"; set by d2 for block-string labels)
			Tooltip:       styleVal(o.Tooltip), // task 124 #5
			Link:          styleVal(o.Link),    // task 124 #5
			Icon:          icon,                // task 124 #3
			Direction:     o.Direction.Value,   // per-container direction (task 127)
			// Explicit dimensions / absolute pin (task 159 → 130).
			Width:  styleVal(o.WidthAttr),
			Height: styleVal(o.HeightAttr),
			Top:    styleVal(o.Top),
			Left:   styleVal(o.Left),
			// Label/icon/tooltip placement (task 159 → 134). Attributes.* = the source keyword; the
			// bare o.LabelPosition/o.IconPosition are the (nil here) layout-resolved *string shadow.
			LabelPosition:   styleVal(o.Attributes.LabelPosition),
			IconPosition:    styleVal(o.Attributes.IconPosition),
			TooltipPosition: styleVal(o.Attributes.TooltipPosition),
			IconStyle:       toOutStyle(o.IconStyle), // task 159 → 134/135
			Special:         sp,
		}
		// sql_table columns + class fields/methods (for the bespoke JS renderers)
		if o.SQLTable != nil {
			for _, c := range o.SQLTable.Columns {
				sh.Columns = append(sh.Columns, outColumn{
					Name:       c.Name.Label,
					Type:       c.Type.Label,
					Constraint: strings.Join(c.Constraint, ","),
				})
			}
		}
		if o.Class != nil {
			for _, f := range o.Class.Fields {
				sh.Fields = append(sh.Fields, outMember{Name: f.Name, Type: f.Type, Visibility: f.Visibility})
			}
			for _, m := range o.Class.Methods {
				sh.Methods = append(sh.Methods, outMember{Name: m.Name, Type: m.Return, Visibility: m.Visibility})
			}
		}
		og.Shapes = append(og.Shapes, sh)
	}
	for _, e := range g.Edges {
		var src, dst, label string
		if e.Src != nil {
			src = e.Src.AbsID()
		}
		if e.Dst != nil {
			dst = e.Dst.AbsID()
		}
		label = e.Label.Value
		oe := outEdge{
			Src: src, Dst: dst, Label: label,
			SrcArrow: e.SrcArrow, DstArrow: e.DstArrow,
			// Connection style (task 124 #1); empty when unset → renderer keeps the theme default.
			Stroke:       styleVal(e.Style.Stroke),
			StrokeWidth:  styleVal(e.Style.StrokeWidth),
			StrokeDash:   styleVal(e.Style.StrokeDash),
			Opacity:      styleVal(e.Style.Opacity),
			Animated:     styleVal(e.Style.Animated) == "true",
			BorderRadius: styleVal(e.Style.BorderRadius), // task 159 → 135 (connection corner rounding)
			// Connection label text styling (task 159 → 129).
			FontColor: styleVal(e.Style.FontColor),
			FontSize:  styleVal(e.Style.FontSize),
			Bold:      styleVal(e.Style.Bold) == "true",
			Italic:    styleVal(e.Style.Italic) == "true",
			Underline: styleVal(e.Style.Underline) == "true",
			// d2 sets these to a column row when the edge endpoint is <table>.<col> (task 133).
			SrcColumnIndex: e.SrcTableColumnIndex,
			DstColumnIndex: e.DstTableColumnIndex,
		}
		// ToArrowhead() resolves the shape string incl. filled-* variants (task 128).
		if e.SrcArrowhead != nil {
			oe.SrcArrowhead = &outArrowhead{Shape: string(e.SrcArrowhead.ToArrowhead()), Label: e.SrcArrowhead.Label.Value}
		}
		if e.DstArrowhead != nil {
			oe.DstArrowhead = &outArrowhead{Shape: string(e.DstArrowhead.ToArrowhead()), Label: e.DstArrowhead.Label.Value}
		}
		og.Edges = append(og.Edges, oe)
	}
	// Root-level `direction:` lives on g.Root (not in g.Objects), task 127.
	if g.Root != nil {
		og.Direction = g.Root.Direction.Value
	}
	// A top-level `shape: sequence_diagram` lives on the ROOT object, which is NOT in
	// g.Objects — so per-shape isSequence misses it. Walk each object's ancestor chain
	// (incl. the root) to catch both the top-level and the named-container forms.
	for _, o := range g.Objects {
		for p := o; p != nil; p = p.Parent {
			if p.IsSequenceDiagram() {
				og.Sequence = true
				break
			}
		}
		if og.Sequence {
			break
		}
	}
	b, err := json.Marshal(og)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func d2compile(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return map[string]interface{}{"error": "missing d2 source"}
	}
	out, err := compileToJSON(args[0].String())
	if err != nil {
		return map[string]interface{}{"error": err.Error()}
	}
	return map[string]interface{}{"graph": out}
}

func main() {
	js.Global().Set("d2compile", js.FuncOf(d2compile))
	select {}
}

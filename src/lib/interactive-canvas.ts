export type CanvasCard = {
  id: string;
  title: string;
  summary: string;
  items?: string[];
  details?: string;
};

export type UiElement = {
  type: string;
  description: string;
};

export type WireframeElement = {
  id?: string;
  type: string;
  text?: string;
  color?: string;
  background?: string;
  width?: "full" | "half" | "auto" | string;
  rationale?: string;
  description?: string;
  name?: string;
};

export type WireframeScreen = {
  id: string;
  title: string;
  screenName?: string;
  description?: string;
  layout?: string;
  elements: WireframeElement[];
  uiElements?: UiElement[];
};

export type BusinessModelBlock = {
  productSummary: string;
  glossary: string[];
  competitorsAndMarket: string[];
  attributesAndFrictions: string[];
  legalAndCompliance: string[];
  objectivesAndKPIs: string[];
  /** Legacy fields (mapeados si el modelo aún los emite) */
  coreActions?: string[];
  advantages?: string[];
  disadvantages?: string[];
  stakeholders?: string[];
  valueProposition?: string;
  marketEvaluation?: string[];
  coreMechanics?: string;
  vision?: string;
  targetAudience?: string;
};

export type InteractiveCanvasData = {
  productName: string;
  tagline?: string;
  /** mobile = phone frame; web = browser window */
  platform?: "mobile" | "web";
  businessModel?: BusinessModelBlock;
  bmc: CanvasCard[];
  screens: CanvasCard[];
  designSystem: CanvasCard[];
  wireframes?: WireframeScreen[];
};

const CANVAS_TAG_RE =
  /<interactive_canvas>\s*([\s\S]*?)\s*<\/interactive_canvas>/gi;

export function extractJsonObject(raw: string): string {
  let cleaned = raw.trim();

  // Prefer content inside <interactive_canvas>...</interactive_canvas>
  const tagMatch = /<interactive_canvas>\s*([\s\S]*?)\s*<\/interactive_canvas>/i.exec(
    cleaned,
  );
  if (tagMatch?.[1]) {
    cleaned = tagMatch[1].trim();
  } else {
    cleaned = cleaned.replace(/<\/?interactive_canvas>/gi, "").trim();
  }

  // Strip accidental markdown fences inside or outside the tag
  cleaned = cleaned
    .replace(/```(?:json|JSON|javascript|js)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  // Drop leading prose / markdown tables before the first object
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  // Soft-clean trailing commas that break JSON.parse
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  return cleaned;
}

function looksLikeCanvasJson(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    !!obj.businessModel ||
    Array.isArray(obj.bmc) ||
    Array.isArray(obj.wireframes) ||
    Array.isArray(obj.screens) ||
    typeof obj.productName === "string"
  );
}

function toUiElements(
  primary: unknown,
  fallbackA?: unknown,
  fallbackB?: unknown,
): UiElement[] {
  const source = Array.isArray(primary)
    ? primary
    : Array.isArray(fallbackA)
      ? fallbackA
      : Array.isArray(fallbackB)
        ? fallbackB
        : [];

  return source
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => {
      const type = String(c.type ?? "Widget");
      const description = String(
        c.description ??
          c.rationale ??
          c.name ??
          c.text ??
          type,
      );
      return { type, description };
    });
}

function uiToElements(uiElements: UiElement[]): WireframeElement[] {
  return uiElements.map((el, i) => ({
    id: `ui-${i}`,
    type: el.type,
    name: el.type,
    text: el.type,
    description: el.description,
    rationale: el.description,
  }));
}

function normalizeWireframes(raw: unknown): WireframeScreen[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const screen = item as Record<string, unknown>;
      const title = String(
        screen.screenName ??
          screen.title ??
          screen.name ??
          `Pantalla ${index + 1}`,
      );
      const layout =
        typeof screen.layout === "string"
          ? screen.layout
          : typeof screen.rationale === "string"
            ? screen.rationale
            : typeof screen.description === "string"
              ? screen.description
              : undefined;
      const uiElements = toUiElements(
        screen.uiElements,
        screen.components,
        screen.elements,
      );
      const elements = uiToElements(uiElements);
      return {
        id: String(screen.id ?? `screen-${index}`),
        title,
        screenName: title,
        layout,
        description: layout,
        elements,
        uiElements,
      };
    })
    .filter(Boolean) as WireframeScreen[];
}

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (typeof x === "string") return x.trim();
      if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        return String(o.text ?? o.name ?? o.description ?? "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

function normalizeBusinessModel(
  raw: unknown,
): BusinessModelBlock | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const b = raw as Record<string, unknown>;

  const productSummary =
    typeof b.productSummary === "string"
      ? b.productSummary.trim()
      : typeof b.valueProposition === "string"
        ? b.valueProposition.trim()
        : typeof b.vision === "string"
          ? b.vision.trim()
          : typeof b.coreMechanics === "string"
            ? b.coreMechanics.trim()
            : "";

  let glossary = asStringArray(b.glossary);
  let competitorsAndMarket = asStringArray(b.competitorsAndMarket);
  let attributesAndFrictions = asStringArray(b.attributesAndFrictions);
  let legalAndCompliance = asStringArray(b.legalAndCompliance);
  let objectivesAndKPIs = asStringArray(b.objectivesAndKPIs);

  // Legacy → new fields
  const marketEvaluation = asStringArray(b.marketEvaluation);
  const advantages = asStringArray(b.advantages);
  const disadvantages = asStringArray(b.disadvantages);
  const coreActions = asStringArray(b.coreActions);
  const stakeholders = asStringArray(b.stakeholders);

  if (competitorsAndMarket.length === 0) {
    competitorsAndMarket = [...advantages, ...marketEvaluation].slice(0, 4);
  }
  if (attributesAndFrictions.length === 0) {
    attributesAndFrictions = [...coreActions, ...disadvantages].slice(0, 4);
  }
  if (glossary.length === 0 && stakeholders.length > 0) {
    glossary = stakeholders.map((s) => s.replace(/^[+\-]\s*/, ""));
  }
  if (objectivesAndKPIs.length === 0 && productSummary) {
    objectivesAndKPIs = [productSummary.slice(0, 80)];
  }

  const hasAny =
    !!productSummary ||
    glossary.length +
      competitorsAndMarket.length +
      attributesAndFrictions.length +
      legalAndCompliance.length +
      objectivesAndKPIs.length >
      0;

  if (!hasAny) return undefined;

  return {
    productSummary,
    glossary,
    competitorsAndMarket,
    attributesAndFrictions,
    legalAndCompliance,
    objectivesAndKPIs,
    coreActions,
    advantages,
    disadvantages,
    stakeholders,
    valueProposition: productSummary || undefined,
    marketEvaluation,
    vision: productSummary || undefined,
    targetAudience:
      typeof b.targetAudience === "string" ? b.targetAudience : undefined,
  };
}

function normalizePlatform(raw: unknown): "mobile" | "web" {
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if (v === "web" || v === "desktop" || v === "browser" || v === "saas") {
      return "web";
    }
    if (v === "mobile" || v === "app" || v === "ios" || v === "android") {
      return "mobile";
    }
  }
  return "mobile";
}

function normalizeCanvasData(
  parsed: InteractiveCanvasData,
): InteractiveCanvasData {
  const businessModel = normalizeBusinessModel(
    (parsed as { businessModel?: unknown }).businessModel,
  );
  return {
    productName:
      parsed.productName ||
      (businessModel?.productSummary
        ? businessModel.productSummary.slice(0, 48)
        : businessModel?.objectivesAndKPIs?.[0]
          ? businessModel.objectivesAndKPIs[0].slice(0, 48)
          : "Producto"),
    tagline: parsed.tagline,
    platform: normalizePlatform(
      (parsed as { platform?: unknown }).platform,
    ),
    businessModel,
    bmc: Array.isArray(parsed.bmc) ? parsed.bmc : [],
    screens: Array.isArray(parsed.screens) ? parsed.screens : [],
    designSystem: Array.isArray(parsed.designSystem)
      ? parsed.designSystem
      : [],
    wireframes: normalizeWireframes(parsed.wireframes),
  };
}

export function parseInteractiveCanvas(
  rawText: string,
): InteractiveCanvasData | null {
  try {
    // Extrae JSON aunque venga con <interactive_canvas>, ```json o prosa alrededor
    const jsonText = extractJsonObject(rawText);
    const parsed = JSON.parse(jsonText) as InteractiveCanvasData;
    if (!looksLikeCanvasJson(parsed)) {
      return null;
    }
    return normalizeCanvasData(parsed);
  } catch {
    return null;
  }
}

export function stripInteractiveCanvas(text: string): string {
  let cleaned = text.replace(CANVAS_TAG_RE, "");
  cleaned = cleaned.replace(/<interactive_canvas>[\s\S]*$/i, "");
  const maybeJson = extractJsonObject(cleaned);
  if (
    maybeJson.startsWith("{") &&
    /"businessModel"\s*:|"wireframes"\s*:|"bmc"\s*:|"productName"\s*:/.test(
      maybeJson,
    )
  ) {
    return "";
  }
  return cleaned.trim();
}

export function hasIncompleteCanvasTag(text: string): boolean {
  const open = (text.match(/<interactive_canvas>/gi) ?? []).length;
  const close = (text.match(/<\/interactive_canvas>/gi) ?? []).length;
  return open > close;
}

function looksLikeCanvasPayload(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("<interactive_canvas>") ||
    t.includes('"wireframes"') ||
    t.includes('"businessmodel"') ||
    t.includes('"uielements"') ||
    t.includes('"marketevaluation"') ||
    t.includes('"bmc"') ||
    /```json/i.test(text)
  );
}

export type ChatSegment =
  | { type: "text"; content: string }
  | { type: "canvas"; data: InteractiveCanvasData }
  | { type: "canvas-loading" };

export function splitChatContent(text: string): ChatSegment[] {
  const segments: ChatSegment[] = [];
  let lastIndex = 0;
  const re = new RegExp(CANVAS_TAG_RE.source, "gi");
  let match: RegExpExecArray | null;
  let foundTaggedCanvas = false;

  while ((match = re.exec(text)) !== null) {
    foundTaggedCanvas = true;
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) {
      segments.push({ type: "text", content: before.trim() });
    }
    const data = parseInteractiveCanvas(match[0]);
    if (data) segments.push({ type: "canvas", data });
    else segments.push({ type: "canvas-loading" });
    lastIndex = match.index + match[0].length;
  }

  const rest = text.slice(lastIndex);

  if (hasIncompleteCanvasTag(rest)) {
    const beforeIncomplete = rest
      .replace(/<interactive_canvas>[\s\S]*$/i, "")
      .trim();
    if (beforeIncomplete) {
      segments.push({ type: "text", content: beforeIncomplete });
    }
    segments.push({ type: "canvas-loading" });
    return segments;
  }

  if (!foundTaggedCanvas && looksLikeCanvasPayload(text)) {
    const opens = (text.match(/\{/g) ?? []).length;
    const closes = (text.match(/\}/g) ?? []).length;
    if (opens > closes) {
      segments.push({ type: "canvas-loading" });
      return segments;
    }
    const data = parseInteractiveCanvas(text);
    if (data) {
      const prose = stripInteractiveCanvas(text);
      if (prose) segments.push({ type: "text", content: prose });
      segments.push({ type: "canvas", data });
      return segments;
    }
  }

  if (rest.trim()) {
    segments.push({ type: "text", content: rest.trim() });
  }

  return segments;
}

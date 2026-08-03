"use client";

import { useMemo, useState, type ReactNode } from "react";
import type {
  BusinessModelBlock,
  InteractiveCanvasData,
  UiElement,
  WireframeScreen,
} from "@/lib/interactive-canvas";

type TabId = "negocio" | "prototype";

type InteractiveCanvasProps = {
  data: InteractiveCanvasData;
};

export function InteractiveCanvas({ data }: InteractiveCanvasProps) {
  const wireframes = data.wireframes ?? [];
  const hasBusiness = !!data.businessModel;
  const [tab, setTab] = useState<TabId>(
    hasBusiness ? "negocio" : "prototype",
  );

  const title =
    data.productName ||
    data.businessModel?.productSummary?.slice(0, 48) ||
    data.businessModel?.objectivesAndKPIs?.[0]?.slice(0, 48) ||
    "Producto";

  const tabs = useMemo(() => {
    const list: [TabId, string][] = [];
    if (hasBusiness) list.push(["negocio", "Business Canvas"]);
    list.push([
      "prototype",
      data.platform === "web" ? "Prototipo Web" : "Prototipo App",
    ]);
    return list;
  }, [hasBusiness, data.platform]);

  return (
    <div className="my-2 w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[#0f161c] text-[#e8eef2] shadow-[0_20px_50px_-28px_rgba(15,22,28,0.85)]">
      <div className="relative overflow-hidden border-b border-white/10 px-4 py-4 sm:px-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(15,118,110,0.35),transparent_55%)]" />
        <p className="relative text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300/90">
          Canvas · CPO + UX/UI
        </p>
        <h3 className="relative mt-1 font-[family-name:var(--font-display)] text-xl text-white sm:text-2xl">
          {title}
        </h3>
        {data.tagline && (
          <p className="relative mt-1 max-w-2xl text-sm text-white/65">
            {data.tagline}
          </p>
        )}

        <div className="relative mt-4 flex flex-wrap gap-2">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === id
                  ? "bg-teal-500 text-[#06221f]"
                  : "bg-white/8 text-white/70 hover:bg-white/12 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 sm:p-4">
        {tab === "negocio" && data.businessModel ? (
          <BusinessModelPanel model={data.businessModel} />
        ) : (
          <WireframeBoard
            screens={wireframes}
            platform={data.platform ?? "mobile"}
          />
        )}
      </div>
    </div>
  );
}

function ImpactBullet({ text }: { text: string }) {
  const trimmed = text.trim();
  const tone = trimmed.startsWith("+")
    ? "plus"
    : trimmed.startsWith("-")
      ? "minus"
      : "neutral";

  const styles =
    tone === "plus"
      ? {
          row: "border-emerald-500/25 bg-emerald-500/10",
          mark: "text-emerald-300",
          body: "text-emerald-50/90",
          icon: "+",
        }
      : tone === "minus"
        ? {
            row: "border-amber-500/30 bg-amber-500/10",
            mark: "text-amber-300",
            body: "text-amber-50/90",
            icon: "−",
          }
        : {
            row: "border-white/8 bg-black/20",
            mark: "text-teal-300",
            body: "text-white/80",
            icon: "•",
          };

  const label =
    tone === "plus" || tone === "minus"
      ? trimmed.replace(/^[+\-]\s*/, "")
      : trimmed;

  return (
    <li
      className={`flex items-start gap-2 rounded-lg border px-2 py-1.5 ${styles.row}`}
    >
      <span
        className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded text-[11px] font-bold ${styles.mark}`}
        aria-hidden
      >
        {styles.icon}
      </span>
      <p className={`text-[12px] font-medium leading-snug ${styles.body}`}>
        {label}
      </p>
    </li>
  );
}

function BusinessModelPanel({ model }: { model: BusinessModelBlock }) {
  const bulletSections: {
    id: string;
    title: string;
    items: string[];
    accent: string;
    badge: string;
    impact?: boolean;
  }[] = [
    {
      id: "glossary",
      title: "Glosario (siglas explicadas)",
      items: model.glossary,
      accent: "border-sky-500/25 from-sky-500/10",
      badge: "DICC",
      impact: false,
    },
    {
      id: "comp",
      title: "Competencia y mercado",
      items: model.competitorsAndMarket,
      accent: "border-emerald-500/25 from-emerald-500/10",
      badge: "MKT",
      impact: true,
    },
    {
      id: "attr",
      title: "Atributos y fricciones",
      items: model.attributesAndFrictions,
      accent: "border-cyan-500/25 from-cyan-500/10",
      badge: "UX",
      impact: true,
    },
    {
      id: "legal",
      title: "Legal y cumplimiento (PY)",
      items: model.legalAndCompliance,
      accent: "border-violet-500/25 from-violet-500/10",
      badge: "BCP",
      impact: true,
    },
    {
      id: "kpis",
      title: "Objetivos e indicadores",
      items: model.objectivesAndKPIs,
      accent: "border-teal-500/30 from-teal-500/15",
      badge: "KPI",
      impact: true,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Business Canvas · Español · Paraguay
        </p>
        <p className="text-[10px] text-white/30">Didáctico · escaneable</p>
      </div>

      <article className="rounded-2xl border border-teal-500/30 bg-gradient-to-b from-teal-500/15 to-transparent p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/90">
            ¿Qué es este producto?
          </h4>
          <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white/50">
            RESUMEN
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-white/85">
          {model.productSummary || "Sin resumen aún."}
        </p>
      </article>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {bulletSections.map((section) => (
          <article
            key={section.id}
            className={`rounded-2xl border bg-gradient-to-b ${section.accent} to-transparent p-4 ${
              section.id === "glossary" || section.id === "legal"
                ? "sm:col-span-2 xl:col-span-1"
                : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/90">
                {section.title}
              </h4>
              <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white/50">
                {section.badge}
              </span>
            </div>

            {section.items.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {section.items.map((item, i) =>
                  section.impact ? (
                    <ImpactBullet key={`${section.id}-${i}`} text={item} />
                  ) : (
                    <li
                      key={`${section.id}-${i}`}
                      className="flex gap-2 rounded-lg border border-white/8 bg-black/20 px-2.5 py-1.5"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />
                      <p className="text-[12px] leading-snug text-white/80">
                        {item}
                      </p>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p className="mt-3 text-[12px] text-white/35">Sin datos aún.</p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function WireframeBoard({
  screens,
  platform,
}: {
  screens: WireframeScreen[];
  platform: "mobile" | "web";
}) {
  if (screens.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-10 text-center text-sm text-white/50">
        Sin wireframes. Pedí{" "}
        <span className="text-teal-300">Generar Business</span> para generar
        pantallas.
      </p>
    );
  }

  const isWeb = platform === "web";

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
            Wireframes · {isWeb ? "Web / Desktop" : "Mobile App"}
          </p>
          <p className="mt-1 text-sm text-white/55">
            {isWeb
              ? "Ventanas de navegador con controles de escritorio."
              : "Marcos de teléfono con controles nativos."}
          </p>
        </div>
        <p className="rounded-md bg-white/8 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-300">
          {platform}
        </p>
      </div>

      <div
        className={
          isWeb
            ? "grid gap-5 xl:grid-cols-1"
            : "grid gap-6 justify-items-center sm:grid-cols-2 xl:grid-cols-3"
        }
      >
        {screens.map((screen, index) => (
          <ScreenFrame
            key={screen.id}
            screen={screen}
            index={index}
            platform={platform}
          />
        ))}
      </div>
    </div>
  );
}

function ScreenFrame({
  screen,
  index,
  platform,
}: {
  screen: WireframeScreen;
  index: number;
  platform: "mobile" | "web";
}) {
  const title = screen.screenName || screen.title;
  const layout = screen.layout || screen.description;
  const uiElements: UiElement[] = screen.uiElements?.length
    ? screen.uiElements
    : screen.elements.map((el) => ({
        type: el.type,
        description:
          el.description || el.rationale || el.name || el.text || "",
      }));

  return (
    <div
      className={`flex flex-col ${platform === "web" ? "w-full" : "w-full items-center"}`}
    >
      <div
        className={`mb-2 flex items-center gap-2 px-1 ${platform === "web" ? "w-full" : "w-80 max-w-full"}`}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-teal-500/20 text-[10px] font-bold text-teal-300">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-white/90">{title}</p>
          {layout && (
            <p className="truncate text-[11px] text-white/45">{layout}</p>
          )}
        </div>
      </div>

      {platform === "mobile" ? (
        <MobileDeviceFrame title={title} uiElements={uiElements} screenId={screen.id} />
      ) : (
        <BrowserWindowFrame title={title} uiElements={uiElements} screenId={screen.id} />
      )}
    </div>
  );
}

function MobileDeviceFrame({
  title,
  uiElements,
  screenId,
}: {
  title: string;
  uiElements: UiElement[];
  screenId: string;
}) {
  return (
    <div className="relative mx-auto h-[650px] w-80 max-w-full overflow-hidden rounded-[2.5rem] border-[12px] border-gray-900 bg-gray-900 shadow-xl">
      <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
      <div className="flex h-full flex-col overflow-y-auto bg-[#f4f6f8] pt-8">
        <div className="flex items-center justify-between px-4 pb-2 text-[10px] font-medium text-slate-500">
          <span>9:41</span>
          <span className="font-semibold text-slate-700">{title}</span>
          <span>100%</span>
        </div>
        <div className="flex flex-1 flex-col gap-2.5 px-3 pb-4">
          {uiElements.map((el, i) => (
            <UiElementBlock
              key={`${screenId}-ui-${i}`}
              element={el}
              platform="mobile"
            />
          ))}
          {uiElements.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 px-2 py-8 text-center text-[11px] text-slate-400">
              Sin elementos UI
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function BrowserWindowFrame({
  title,
  uiElements,
  screenId,
}: {
  title: string;
  uiElements: UiElement[];
  screenId: string;
}) {
  return (
    <div className="w-full min-h-[500px] overflow-hidden rounded-xl border border-gray-300 bg-gray-50 shadow-lg">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        </div>
        <div className="ml-2 flex-1 truncate rounded-md border border-gray-200 bg-white px-3 py-1 text-[11px] text-slate-500">
          https://app.example.com/{title.toLowerCase().replace(/\s+/g, "-")}
        </div>
      </div>
      <div className="grid min-h-[460px] gap-3 p-4 md:grid-cols-[180px_minmax(0,1fr)]">
        <aside className="hidden rounded-lg border border-gray-100 bg-white p-3 shadow-sm md:block">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Menú lateral
          </p>
          <div className="mt-3 space-y-2">
            {["Inicio", "Metas", "Reportes", "Ajustes"].map((item) => (
              <div
                key={item}
                className="rounded-md bg-slate-50 px-2 py-1.5 text-[11px] font-medium text-slate-600"
              >
                {item}
              </div>
            ))}
          </div>
        </aside>
        <div className="flex flex-col gap-2.5">
          <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 shadow-sm">
            <p className="text-sm font-semibold text-slate-800">{title}</p>
          </div>
          {uiElements.map((el, i) => (
            <UiElementBlock
              key={`${screenId}-ui-${i}`}
              element={el}
              platform="web"
            />
          ))}
          {uiElements.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 px-2 py-8 text-center text-[11px] text-slate-400">
              Sin elementos UI
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

type UiKind =
  | "header"
  | "progress"
  | "cta"
  | "input"
  | "date"
  | "nav"
  | "sidebar"
  | "table"
  | "hero"
  | "toggle"
  | "search"
  | "fab"
  | "card"
  | "default";

function classifyUi(type: string): UiKind {
  const t = type.toLowerCase();
  if (/date\s*picker|calendar|fecha|selector de fecha/i.test(t)) return "date";
  if (/toggle|switch|checkbox|interruptor/i.test(t)) return "toggle";
  if (/search|b[uú]squeda/i.test(t)) return "search";
  if (/data\s*table|table|grid|tabla/i.test(t)) return "table";
  if (/hero|banner|cover|imagen hero/i.test(t)) return "hero";
  if (/sidebar|side\s*nav|men[uú]\s*lateral/i.test(t)) return "sidebar";
  if (/fab|floating\s*action|bot[oó]n flotante/i.test(t)) return "fab";
  if (
    /bottom\s*nav|tab\s*bar|bottom\s*navigation|navegaci[oó]n inferior|pesta[nñ]as inferiores/i.test(
      t,
    )
  )
    return "nav";
  if (
    /header|saldo|status\s*bar|top\s*nav|title|encabezado|barra de estado/i.test(
      t,
    )
  )
    return "header";
  if (
    /progress|barra|ring|circular|chart|meta|%|gauge|anillo de progreso/i.test(
      t,
    )
  )
    return "progress";
  if (
    /cta|call to action|bot[oó]n|button|action|acelerar|aportar|bot[oó]n de acci[oó]n/i.test(
      t,
    )
  )
    return "cta";
  if (/input|field|form|text\s*field|segmented|campo/i.test(t)) return "input";
  if (/nav|menu|navegaci/i.test(t)) return "nav";
  if (/card|list|item|widget|tile|swipe|tarjeta/i.test(t)) return "card";
  return "default";
}

function ControlShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-gray-100 bg-white p-3 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function UiElementBlock({
  element,
  platform,
}: {
  element: UiElement;
  platform: "mobile" | "web";
}) {
  const kind = classifyUi(element.type);

  if (kind === "header") {
    return (
      <div className="rounded-lg bg-[#0f766e] px-3 py-3 text-white shadow-sm">
        <p className="text-[9px] font-bold uppercase tracking-wide text-teal-100/80">
          {element.type}
        </p>
        <p className="mt-1 text-sm font-semibold leading-snug">
          {element.description}
        </p>
      </div>
    );
  }

  if (kind === "hero") {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-100 bg-gradient-to-br from-slate-700 to-slate-900 p-4 shadow-sm">
        <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">
          {element.type}
        </p>
        <p className="mt-2 text-sm font-semibold text-white">
          {element.description}
        </p>
        <div className="mt-3 h-16 rounded-md bg-white/10" />
      </div>
    );
  }

  if (kind === "progress") {
    return (
      <ControlShell className="!items-start flex-col">
        <p className="text-[9px] font-bold uppercase tracking-wide text-teal-700">
          {element.type}
        </p>
        <div className="mt-1 flex w-full items-center gap-3">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[4px] border-teal-500/30 border-t-teal-600">
            <span className="text-[10px] font-bold text-teal-800">75%</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-snug text-slate-600">
              {element.description}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-3/4 rounded-full bg-teal-500" />
            </div>
          </div>
        </div>
      </ControlShell>
    );
  }

  if (kind === "date") {
    return (
      <ControlShell>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-600">
          DATE
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
            {element.type}
          </p>
          <div className="mt-1 flex items-center justify-between rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-1.5">
            <span className="text-[11px] text-slate-600">
              {element.description || "Seleccionar fecha"}
            </span>
            <span className="text-[10px] text-slate-400">▾</span>
          </div>
        </div>
      </ControlShell>
    );
  }

  if (kind === "toggle") {
    return (
      <ControlShell className="justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
            {element.type}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            {element.description}
          </p>
        </div>
        <span className="relative h-6 w-10 shrink-0 rounded-full bg-teal-500">
          <span className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow" />
        </span>
      </ControlShell>
    );
  }

  if (kind === "search") {
    return (
      <ControlShell>
        <span className="text-[12px] text-slate-400">⌕</span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
            {element.type}
          </p>
          <p className="truncate text-[11px] text-slate-500">
            {element.description || "Buscar…"}
          </p>
        </div>
      </ControlShell>
    );
  }

  if (kind === "table") {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
            {element.type}
          </p>
          <p className="text-[11px] text-slate-600">{element.description}</p>
        </div>
        <div className="grid grid-cols-3 gap-px bg-slate-100 text-center text-[10px] font-semibold text-slate-500">
          <span className="bg-white px-2 py-1.5">Col A</span>
          <span className="bg-white px-2 py-1.5">Col B</span>
          <span className="bg-white px-2 py-1.5">Col C</span>
        </div>
        {[1, 2].map((row) => (
          <div
            key={row}
            className="grid grid-cols-3 gap-px border-t border-slate-100 text-center text-[10px] text-slate-500"
          >
            <span className="px-2 py-1.5">—</span>
            <span className="px-2 py-1.5">—</span>
            <span className="px-2 py-1.5">—</span>
          </div>
        ))}
      </div>
    );
  }

  if (kind === "cta") {
    return (
      <div className="rounded-lg border border-teal-100 bg-white p-3 shadow-sm">
        <p className="text-[9px] font-bold uppercase tracking-wide text-teal-700">
          {element.type}
        </p>
        <div className="mt-2 rounded-lg bg-teal-600 px-3 py-2.5 text-center text-xs font-semibold text-white shadow-sm">
          {element.description.replace(/^bot[oó]n\s*(primario)?\s*:?\s*/i, "") ||
            "Acción primaria"}
        </div>
      </div>
    );
  }

  if (kind === "fab") {
    return (
      <div className="flex justify-end">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-600 text-lg font-bold text-white shadow-lg">
          +
        </div>
      </div>
    );
  }

  if (kind === "nav") {
    return (
      <div className="rounded-lg border border-gray-100 bg-white p-2 shadow-sm">
        <p className="mb-1.5 text-center text-[9px] font-bold uppercase tracking-wide text-slate-500">
          {element.type}
        </p>
        <div className="flex justify-around gap-1">
          {(platform === "mobile"
            ? ["Inicio", "Metas", "Más"]
            : ["Resumen", "Analítica", "Ajustes"]
          ).map((label) => (
            <span
              key={label}
              className="rounded-md bg-slate-100 px-2 py-1.5 text-[10px] font-medium text-slate-600"
            >
              {label}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-center text-[10px] text-slate-500">
          {element.description}
        </p>
      </div>
    );
  }

  if (kind === "sidebar") {
    return (
      <ControlShell className="!items-start flex-col">
        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
          {element.type}
        </p>
        <p className="text-[11px] text-slate-600">{element.description}</p>
        <div className="mt-1 flex w-full flex-col gap-1">
          {["Nav item A", "Nav item B", "Nav item C"].map((item) => (
            <span
              key={item}
              className="rounded-md bg-slate-50 px-2 py-1 text-[10px] text-slate-600"
            >
              {item}
            </span>
          ))}
        </div>
      </ControlShell>
    );
  }

  if (kind === "input") {
    return (
      <ControlShell className="!items-start flex-col">
        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
          {element.type}
        </p>
        <div className="mt-1 w-full rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-[11px] text-slate-500">
          {element.description}
        </div>
      </ControlShell>
    );
  }

  return (
    <ControlShell className="!items-start flex-col">
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
        {element.type}
      </span>
      <p className="text-[11px] leading-snug text-slate-600">
        {element.description}
      </p>
    </ControlShell>
  );
}

export function InteractiveCanvasLoading() {
  return (
    <div className="my-2 animate-pulse rounded-2xl border border-[var(--line)] bg-[#0f161c] px-5 py-8 text-sm text-white/55">
      Generando canvas CPO + UX…
    </div>
  );
}

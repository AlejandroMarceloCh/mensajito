// Restored from the original green dashboard build; the live API remains the only data source in live mode.
import * as import_react57 from "react";
import * as jsx_runtime from "react/jsx-runtime";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, CircleHelp as CircleQuestionMark, Clock3, Funnel as Funnel2, Layers, MapPin, MessageSquare, RefreshCw, Sparkles, Target, TrendingUp, Users, X } from "lucide-react";
import { Root as Dialog, Close as DialogClose, Description as DialogDescription, Overlay as DialogOverlay, Title as DialogTitle, Content as DialogContent, Portal as DialogPortal } from "@radix-ui/react-dialog";
import { listContacts, listAppointments, USE_MOCK, READ_ONLY } from "./api";
import { STAGE_META, agentName, analyticsModel, attentionReason, shortDate, ratio, isQualified } from "./analytics";
import "./overview.css";

var percent = (value) => value === null ? "—" : value + "%";
var initials = (c) => (c.name ?? "Lead").split(" ").slice(0, 2).map((s) => s[0]).join("");
var profileText = (value) => typeof value === "string" ? value : null;
var cash = (value) => typeof value === "number" ? new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(value) : null;
export function Overview({ onOpen }) {
  const [all, setAll] = import_react57.useState([]);
  const [appointments, setAppointments] = import_react57.useState([]);
  const [agent, setAgent] = import_react57.useState("all");
  const [period, setPeriod] = import_react57.useState(30);
  const [error, setError] = import_react57.useState("");
  const [loaded, setLoaded] = import_react57.useState(false);
  const [refreshing, setRefreshing] = import_react57.useState(false);
  const [updated, setUpdated] = import_react57.useState(Date.now());
  const [drawer, setDrawer] = import_react57.useState(null);
  const [exported, setExported] = import_react57.useState(false);
  const [definitions, setDefinitions] = import_react57.useState(false);
  const [attentionTab, setAttentionTab] = import_react57.useState("attention");
  const alive = import_react57.useRef(true);
  const inFlight = import_react57.useRef(false);
  const load = import_react57.useCallback(async () => {
    if (inFlight.current)
      return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const appointmentsResult = await listAppointments();
      const contacts = [];
      for (let offset = 0;; offset += 100) {
        const result = await listContacts({ limit: 100, offset });
        contacts.push(...result.items);
        if (contacts.length >= result.total || !result.items.length)
          break;
      }
      if (alive.current) {
        setAll(contacts);
        setAppointments(appointmentsResult.items);
        setError("");
        setLoaded(true);
        setUpdated(Date.now());
      }
    } catch {
      if (alive.current)
        setError("No pudimos actualizar los datos. Puedes volver a intentarlo.");
    } finally {
      inFlight.current = false;
      if (alive.current)
        setRefreshing(false);
    }
  }, []);
  import_react57.useEffect(() => {
    alive.current = true;
    load();
    const timer = setInterval(() => void load(), 1e4);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [load]);
  const model = import_react57.useMemo(() => analyticsModel(all, period, agent, updated), [all, period, agent, updated]);
  const { rows, previous, trend, qualified, overdue, districts, attention, upcoming } = model;
  const visits = USE_MOCK ? model.visits : rows.filter(c => appointments.some(a => a.contactId === c.id && a.kind === "visit" && a.status === "confirmed"));
  const show = (title, list, description = "Contactos del período y agente seleccionados.") => setDrawer({ title, rows: list, description });
  const difference = rows.length - previous.length;
  const actionRows = attentionTab === "attention" ? attention : upcoming;
  const exportCsv = () => {
    const escape = (value) => '"' + (/^[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""') + '"';
    const csv = [["Nombre", "Agente", "Etapa", "Distrito", "Fecha de ingreso"], ...rows.map((c) => [c.name ?? "Sin nombre", agentName(c.agent), STAGE_META.find((s) => s.stage === c.stage)?.label ?? c.stage, profileText(c.profile.district) ?? "", c.createdAt])].map((row) => row.map(escape).join(",")).join(`\r
`);
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "mensajito-leads-" + period + "d.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true);
    setTimeout(() => setExported(false), 2200);
  };
  return /* @__PURE__ */ jsx_runtime.jsxs("main", {
    className: "insights-workspace",
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "insights-topline",
        children: [
          /* @__PURE__ */ jsx_runtime.jsxs("span", {
            children: [
              /* @__PURE__ */ jsx_runtime.jsx("span", {
                className: "workspace-monogram",
                children: "M"
              }),
              " Mensajito ",
              /* @__PURE__ */ jsx_runtime.jsx("span", {
                className: "crumb-separator",
                children: "/"
              }),
              " ",
              /* @__PURE__ */ jsx_runtime.jsx("strong", {
                children: "Resumen comercial"
              })
            ]
          }),
          /* @__PURE__ */ jsx_runtime.jsxs("span", {
            className: "topline-right",
            children: [
              /* @__PURE__ */ jsx_runtime.jsx("span", {
                className: "demo-badge",
                children: USE_MOCK ? "Vista previa" : "Conectado"
              }),
              /* @__PURE__ */ jsx_runtime.jsx("span", {
                className: "team-avatar",
                children: "AM"
              })
            ]
          })
        ]
      }),
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "insights-page",
        children: [
          /* @__PURE__ */ jsx_runtime.jsxs("header", {
            className: "insights-heading",
            children: [
              /* @__PURE__ */ jsx_runtime.jsxs("div", {
                children: [
                  /* @__PURE__ */ jsx_runtime.jsx("div", {
                    className: "page-eyebrow",
                    children: "TU OPERACIÓN, EN PERSPECTIVA"
                  }),
                  /* @__PURE__ */ jsx_runtime.jsxs("h1", {
                    children: [
                      "Cada lead cuenta",
                      /* @__PURE__ */ jsx_runtime.jsx("span", {
                        children: "."
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsx_runtime.jsx("p", {
                    children: "Entiende el interés. Encuentra la oportunidad. Da el siguiente paso."
                  })
                ]
              }),
              /* @__PURE__ */ jsx_runtime.jsxs("div", {
                className: "heading-actions",
                children: [
                  /* @__PURE__ */ jsx_runtime.jsx("button", {
                    className: "subtle-icon",
                    title: "Actualizar indicadores",
                    "aria-label": "Actualizar indicadores",
                    disabled: refreshing,
                    onClick: () => void load(),
                    children: /* @__PURE__ */ jsx_runtime.jsx(RefreshCw, {
                      size: 17,
                      className: refreshing ? "rotating" : ""
                    })
                  }),
                  /* @__PURE__ */ jsx_runtime.jsxs("button", {
                    className: "outline-action",
                    onClick: exportCsv,
                    disabled: !loaded || !rows.length,
                    children: [
                      exported ? /* @__PURE__ */ jsx_runtime.jsx(Check, {
                        size: 16
                      }) : /* @__PURE__ */ jsx_runtime.jsx(ArrowDownToLine, {
                        size: 16
                      }),
                      " ",
                      exported ? "Exportado" : "Exportar"
                    ]
                  })
                ]
              })
            ]
          }),
          /* @__PURE__ */ jsx_runtime.jsxs("div", {
            className: "insights-filterbar",
            children: [
              /* @__PURE__ */ jsx_runtime.jsx("div", {
                className: "report-tabs",
                children: /* @__PURE__ */ jsx_runtime.jsxs("span", {
                  className: "active",
                  children: [
                    /* @__PURE__ */ jsx_runtime.jsx(Layers, {
                      size: 15
                    }),
                    " Vista general"
                  ]
                })
              }),
              /* @__PURE__ */ jsx_runtime.jsxs("div", {
                className: "report-controls",
                children: [
                  /* @__PURE__ */ jsx_runtime.jsxs("label", {
                    className: "report-select",
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsx(CalendarDays, {
                        size: 15
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("select", {
                        "aria-label": "Período de ingreso",
                        value: period,
                        onChange: (e) => setPeriod(Number(e.target.value)),
                        children: [
                          /* @__PURE__ */ jsx_runtime.jsx("option", {
                            value: 7,
                            children: "Últimos 7 días"
                          }),
                          /* @__PURE__ */ jsx_runtime.jsx("option", {
                            value: 30,
                            children: "Últimos 30 días"
                          }),
                          /* @__PURE__ */ jsx_runtime.jsx("option", {
                            value: 90,
                            children: "Últimos 90 días"
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx(ChevronDown, {
                        size: 13
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsx_runtime.jsxs("label", {
                    className: "report-select",
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsx(Funnel2, {
                        size: 14
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("select", {
                        "aria-label": "Filtrar dashboard por agente",
                        value: agent,
                        onChange: (e) => setAgent(e.target.value),
                        children: [
                          /* @__PURE__ */ jsx_runtime.jsx("option", {
                            value: "all",
                            children: "Todos los agentes"
                          }),
                          /* @__PURE__ */ jsx_runtime.jsx("option", {
                            value: "sales",
                            children: "Tami · Ventas"
                          }),
                          /* @__PURE__ */ jsx_runtime.jsx("option", {
                            value: "housing",
                            children: "Milo · Vivienda"
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx(ChevronDown, {
                        size: 13
                      })
                    ]
                  }),
                  (period !== 30 || agent !== "all") && /* @__PURE__ */ jsx_runtime.jsx("button", {
                    className: "clear-filter",
                    title: "Restablecer filtros",
                    "aria-label": "Restablecer filtros",
                    onClick: () => {
                      setPeriod(30);
                      setAgent("all");
                    },
                    children: /* @__PURE__ */ jsx_runtime.jsx(X, {
                      size: 15
                    })
                  })
                ]
              })
            ]
          }),
          error && /* @__PURE__ */ jsx_runtime.jsxs("div", {
            className: "insights-error",
            role: "alert",
            children: [
              error,
              /* @__PURE__ */ jsx_runtime.jsx("button", {
                onClick: () => void load(),
                children: "Reintentar"
              })
            ]
          }),
          !loaded && !error ? /* @__PURE__ */ jsx_runtime.jsxs("div", {
            className: "insights-loading",
            role: "status",
            children: [
              /* @__PURE__ */ jsx_runtime.jsx(RefreshCw, {
                size: 22,
                className: "rotating"
              }),
              " Preparando tu resumen comercial…"
            ]
          }) : /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
            children: [
              /* @__PURE__ */ jsx_runtime.jsxs("section", {
                className: "priority-banner",
                "aria-label": "Prioridad comercial",
                children: [
                  /* @__PURE__ */ jsx_runtime.jsx("div", {
                    className: "priority-icon",
                    children: /* @__PURE__ */ jsx_runtime.jsx(Sparkles, {
                      size: 22
                    })
                  }),
                  /* @__PURE__ */ jsx_runtime.jsxs("div", {
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsx("span", {
                        className: "priority-eyebrow",
                        children: "EL SIGUIENTE PASO IMPORTA"
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx("h2", {
                        children: overdue.length ? overdue.length + (overdue.length === 1 ? " oportunidad necesita" : " oportunidades necesitan") + " que retomes el contacto" : attention.length ? attention.length + " conversaciones esperan tu revisión" : "Tu operación está al día"
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx("p", {
                        children: overdue.length ? "Hay seguimientos vencidos. Abre el contexto del lead y continúa desde donde quedaron." : "Revisa la actividad del equipo y acompaña cada oportunidad."
                      })
                    ]
                  }),
                  attention.length > 0 && /* @__PURE__ */ jsx_runtime.jsxs("button", {
                    onClick: () => show("Tu próxima acción", attention, "Priorizados por seguimiento vencido y, después, intención de compra."),
                    children: [
                      "Revisar leads ",
                      /* @__PURE__ */ jsx_runtime.jsx(ArrowRight, {
                        size: 16
                      })
                    ]
                  })
                ]
              }),
              /* @__PURE__ */ jsx_runtime.jsxs("section", {
                className: "insight-kpis",
                "aria-label": "Indicadores del período",
                children: [
                  /* @__PURE__ */ jsx_runtime.jsxs("button", {
                    className: "insight-kpi",
                    onClick: () => show("Leads captados", rows),
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
                        className: "kpi-label",
                        children: [
                          "Leads captados ",
                          /* @__PURE__ */ jsx_runtime.jsx(Users, {
                            size: 17
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
                        className: "kpi-value",
                        children: [
                          rows.length,
                          /* @__PURE__ */ jsx_runtime.jsx("span", {
                            className: "kpi-unit",
                            children: "leads"
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
                        className: "kpi-context",
                        children: [
                          /* @__PURE__ */ jsx_runtime.jsxs("span", {
                            className: "metric-change",
                            children: [
                              difference > 0 ? "+" : "",
                              difference
                            ]
                          }),
                          " vs. período anterior (",
                          previous.length,
                          ")"
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("span", {
                        className: "kpi-drill",
                        children: [
                          "Explorar contactos ",
                          /* @__PURE__ */ jsx_runtime.jsx(ArrowUpRight, {
                            size: 13
                          })
                        ]
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsx_runtime.jsxs("button", {
                    className: "insight-kpi",
                    onClick: () => show("Calificados o avanzados", qualified, "Etapa actual: calificado, visita agendada o ganado. Porcentaje del total captado."),
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
                        className: "kpi-label",
                        children: [
                          "Calificación ",
                          /* @__PURE__ */ jsx_runtime.jsx(Target, {
                            size: 17
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx("div", {
                        className: "kpi-value",
                        children: percent(ratio(qualified.length, rows.length))
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
                        className: "kpi-context",
                        children: [
                          qualified.length,
                          " de ",
                          rows.length,
                          " leads calificados o avanzados"
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("span", {
                        className: "kpi-drill",
                        children: [
                          "Ver oportunidades ",
                          /* @__PURE__ */ jsx_runtime.jsx(ArrowUpRight, {
                            size: 13
                          })
                        ]
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsx_runtime.jsxs("button", {
                    className: "insight-kpi",
                    onClick: () => show("Visitas agendadas", visits, USE_MOCK ? "Leads cuya etapa actual es visita agendada. No incluye visitas históricas." : "Leads del período con una cita confirmada registrada en appointments. Una promesa en el chat no cuenta como reserva."),
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
                        className: "kpi-label",
                        children: [
                          "Visitas agendadas ",
                          /* @__PURE__ */ jsx_runtime.jsx(CalendarDays, {
                            size: 17
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
                        className: "kpi-value",
                        children: [
                          visits.length,
                          /* @__PURE__ */ jsx_runtime.jsx("span", {
                            className: "kpi-unit",
                            children: visits.length === 1 ? "visita" : "visitas"
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx("div", {
                        className: "kpi-context",
                        children: USE_MOCK ? "Una conversación más cerca de la decisión" : "Leads con una cita confirmada en Supabase"
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("span", {
                        className: "kpi-drill",
                        children: [
                          "Revisar visitas ",
                          /* @__PURE__ */ jsx_runtime.jsx(ArrowUpRight, {
                            size: 13
                          })
                        ]
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsx_runtime.jsxs("button", {
                    className: "insight-kpi kpi-attention",
                    onClick: () => show("Seguimientos vencidos", overdue),
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
                        className: "kpi-label",
                        children: [
                          "Por retomar ",
                          /* @__PURE__ */ jsx_runtime.jsx(Clock3, {
                            size: 17
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
                        className: "kpi-value",
                        children: [
                          overdue.length,
                          /* @__PURE__ */ jsx_runtime.jsx("span", {
                            className: "kpi-unit",
                            children: "leads"
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
                        className: "kpi-context",
                        children: [
                          /* @__PURE__ */ jsx_runtime.jsx("span", {
                            className: "attention-dot"
                          }),
                          " Seguimientos pendientes de atención"
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("span", {
                        className: "kpi-drill",
                        children: [
                          "Ir al contexto ",
                          /* @__PURE__ */ jsx_runtime.jsx(ArrowUpRight, {
                            size: 13
                          })
                        ]
                      })
                    ]
                  })
                ]
              }),
              /* @__PURE__ */ jsx_runtime.jsxs("div", {
                className: "insights-main-grid",
                children: [
                  /* @__PURE__ */ jsx_runtime.jsxs("section", {
                    className: "report-card acquisition-card",
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsxs("header", {
                        className: "report-card-header",
                        children: [
                          /* @__PURE__ */ jsx_runtime.jsxs("div", {
                            children: [
                              /* @__PURE__ */ jsx_runtime.jsx("h2", {
                                children: "Cómo llegan tus leads"
                              }),
                              /* @__PURE__ */ jsx_runtime.jsxs("p", {
                                children: [
                                  "Captación por agente · ",
                                  period > 7 ? "agrupación semanal" : "por día"
                                ]
                              })
                            ]
                          }),
                          /* @__PURE__ */ jsx_runtime.jsxs("span", {
                            className: "chart-total",
                            children: [
                              rows.length,
                              /* @__PURE__ */ jsx_runtime.jsx("small", {
                                children: "en el período"
                              })
                            ]
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
                        className: "chart-legend",
                        children: [
                          /* @__PURE__ */ jsx_runtime.jsxs("span", {
                            children: [
                              /* @__PURE__ */ jsx_runtime.jsx("i", {
                                className: "tami-dot"
                              }),
                              "Tami · Ventas"
                            ]
                          }),
                          /* @__PURE__ */ jsx_runtime.jsxs("span", {
                            children: [
                              /* @__PURE__ */ jsx_runtime.jsx("i", {
                                className: "milo-dot"
                              }),
                              "Milo · Vivienda"
                            ]
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx("div", {
                        className: "acquisition-chart",
                        children: /* @__PURE__ */ jsx_runtime.jsx(ResponsiveContainer, {
                          width: "100%",
                          height: "100%",
                          children: /* @__PURE__ */ jsx_runtime.jsxs(BarChart, {
                            data: trend,
                            margin: { top: 12, right: 5, left: -28, bottom: 0 },
                            barCategoryGap: "30%",
                            accessibilityLayer: true,
                            children: [
                              /* @__PURE__ */ jsx_runtime.jsx(CartesianGrid, {
                                vertical: false,
                                stroke: "#e9eceb",
                                strokeDasharray: "3 4"
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx(XAxis, {
                                dataKey: "label",
                                tickLine: false,
                                axisLine: false,
                                tick: { fill: "#6d7871", fontSize: 11 },
                                minTickGap: 24,
                                dy: 10
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx(YAxis, {
                                allowDecimals: false,
                                tickLine: false,
                                axisLine: false,
                                tick: { fill: "#6d7871", fontSize: 11 }
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
                                cursor: { fill: "#f0f4f1" },
                                contentStyle: { border: "1px solid #e0e6e1", borderRadius: 10, fontSize: 12, boxShadow: "0 6px 24px #172e1b12" },
                                labelFormatter: (_label, payload) => String(payload[0]?.payload?.range ?? "")
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx(Bar, {
                                dataKey: "Tami",
                                fill: "#397c65",
                                radius: [4, 4, 0, 0],
                                maxBarSize: 28,
                                isAnimationActive: false
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx(Bar, {
                                dataKey: "Milo",
                                fill: "#a7a4d9",
                                radius: [4, 4, 0, 0],
                                maxBarSize: 28,
                                isAnimationActive: false
                              })
                            ]
                          })
                        })
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
                        className: "chart-caption",
                        children: [
                          /* @__PURE__ */ jsx_runtime.jsx(TrendingUp, {
                            size: 14
                          }),
                          /* @__PURE__ */ jsx_runtime.jsx("span", {
                            children: rows.length ? rows.filter((c) => c.agent === "sales").length + " leads de ventas y " + rows.filter((c) => c.agent === "housing").length + " de vivienda." : "No hay contactos para esta selección."
                          }),
                          /* @__PURE__ */ jsx_runtime.jsxs("button", {
                            onClick: () => show("Datos de captación", rows),
                            children: [
                              "Ver datos ",
                              /* @__PURE__ */ jsx_runtime.jsx(ArrowUpRight, {
                                size: 12
                              })
                            ]
                          })
                        ]
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsx_runtime.jsxs("section", {
                    className: "report-card pipeline-card",
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsxs("header", {
                        className: "report-card-header",
                        children: [
                          /* @__PURE__ */ jsx_runtime.jsxs("div", {
                            children: [
                              /* @__PURE__ */ jsx_runtime.jsx("h2", {
                                children: "El recorrido comercial"
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx("p", {
                                children: "Selecciona una etapa para explorar sus leads"
                              })
                            ]
                          }),
                          /* @__PURE__ */ jsx_runtime.jsx(Layers, {
                            size: 18
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx("div", {
                        className: "stage-distribution",
                        children: STAGE_META.map((s) => {
                          const n = rows.filter((c) => c.stage === s.stage).length;
                          return /* @__PURE__ */ jsx_runtime.jsx("span", {
                            style: { flex: n || 0, display: n ? "block" : "none", background: s.color },
                            title: s.label + ": " + n
                          }, s.stage);
                        })
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx("div", {
                        className: "pipeline-stages",
                        children: STAGE_META.map((s) => {
                          const items = rows.filter((c) => c.stage === s.stage);
                          return /* @__PURE__ */ jsx_runtime.jsxs("button", {
                            onClick: () => show(s.label, items),
                            children: [
                              /* @__PURE__ */ jsx_runtime.jsx("span", {
                                className: "stage-swatch",
                                style: { background: s.color }
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx("span", {
                                children: s.label
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx("div", {
                                className: "pipeline-track",
                                children: /* @__PURE__ */ jsx_runtime.jsx("i", {
                                  style: { width: (rows.length ? items.length / rows.length * 100 : 0) + "%", background: s.color }
                                })
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx("b", {
                                children: items.length
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx("small", {
                                children: percent(ratio(items.length, rows.length))
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx(ArrowUpRight, {
                                size: 12
                              })
                            ]
                          }, s.stage);
                        })
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx("p", {
                        className: "card-footnote",
                        children: "Etapas actuales de los leads captados; no es un embudo histórico."
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsx_runtime.jsxs("section", {
                    className: "report-card action-card",
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsxs("header", {
                        className: "report-card-header",
                        children: [
                          /* @__PURE__ */ jsx_runtime.jsxs("div", {
                            children: [
                              /* @__PURE__ */ jsx_runtime.jsx("h2", {
                                children: "Una acción, una oportunidad"
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx("p", {
                                children: "El contexto listo para que tu equipo avance"
                              })
                            ]
                          }),
                          /* @__PURE__ */ jsx_runtime.jsx("span", {
                            className: "count-pill",
                            children: actionRows.length
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
                        className: "action-tabs",
                        children: [
                          /* @__PURE__ */ jsx_runtime.jsxs("button", {
                            "aria-pressed": attentionTab === "attention",
                            className: attentionTab === "attention" ? "selected" : "",
                            onClick: () => setAttentionTab("attention"),
                            children: [
                              "Por atender ",
                              /* @__PURE__ */ jsx_runtime.jsx("span", {
                                children: attention.length
                              })
                            ]
                          }),
                          /* @__PURE__ */ jsx_runtime.jsxs("button", {
                            "aria-pressed": attentionTab === "upcoming",
                            className: attentionTab === "upcoming" ? "selected" : "",
                            onClick: () => setAttentionTab("upcoming"),
                            children: [
                              "Próximos contactos ",
                              /* @__PURE__ */ jsx_runtime.jsx("span", {
                                children: upcoming.length
                              })
                            ]
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
                        className: "attention-list",
                        children: [
                          actionRows.slice(0, 3).map((c) => /* @__PURE__ */ jsx_runtime.jsxs("button", {
                            className: "attention-item",
                            onClick: () => show(c.name ?? "Contexto del lead", [c], "Perfil e información registrados en el CRM."),
                            children: [
                              /* @__PURE__ */ jsx_runtime.jsx("span", {
                                className: "lead-monogram " + c.agent,
                                children: initials(c)
                              }),
                              /* @__PURE__ */ jsx_runtime.jsxs("span", {
                                className: "attention-info",
                                children: [
                                  /* @__PURE__ */ jsx_runtime.jsxs("strong", {
                                    children: [
                                      c.name,
                                      /* @__PURE__ */ jsx_runtime.jsx("span", {
                                        children: agentName(c.agent)
                                      })
                                    ]
                                  }),
                                  /* @__PURE__ */ jsx_runtime.jsx("span", {
                                    className: "attention-summary",
                                    children: profileText(c.profile.notes) ?? profileText(c.profile.objections) ?? c.lastMessagePreview
                                  }),
                                  /* @__PURE__ */ jsx_runtime.jsxs("small", {
                                    children: [
                                      /* @__PURE__ */ jsx_runtime.jsx(Clock3, {
                                        size: 11
                                      }),
                                      attentionTab === "attention" ? attentionReason(c, updated)?.label : "Próximo contacto: " + new Date(c.nextFollowUpAt).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                                    ]
                                  })
                                ]
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx(ArrowUpRight, {
                                size: 17
                              })
                            ]
                          }, c.id)),
                          !actionRows.length && /* @__PURE__ */ jsx_runtime.jsxs("div", {
                            className: "report-empty",
                            children: [
                              /* @__PURE__ */ jsx_runtime.jsx(Check, {
                                size: 23
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx("strong", {
                                children: attentionTab === "attention" ? "Todo al día" : "Sin contactos programados"
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx("span", {
                                children: attentionTab === "attention" ? "No hay pendientes en esta selección." : "Puedes programarlos desde la bandeja."
                              })
                            ]
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("button", {
                        className: "card-bottom-link",
                        onClick: () => show(attentionTab === "attention" ? "Leads por atender" : "Próximos contactos", actionRows),
                        children: [
                          "Ver todos los contactos ",
                          /* @__PURE__ */ jsx_runtime.jsx(ArrowRight, {
                            size: 14
                          })
                        ]
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsx_runtime.jsxs("section", {
                    className: "report-card agents-card",
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsxs("header", {
                        className: "report-card-header",
                        children: [
                          /* @__PURE__ */ jsx_runtime.jsxs("div", {
                            children: [
                              /* @__PURE__ */ jsx_runtime.jsx("h2", {
                                children: "Dos agentes, un equipo"
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx("p", {
                                children: "Resultados dentro del período seleccionado"
                              })
                            ]
                          }),
                          /* @__PURE__ */ jsx_runtime.jsx(Users, {
                            size: 18
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx("div", {
                        className: "agent-scorecards",
                        children: ["sales", "housing"].filter((a) => agent === "all" || a === agent).map((a) => {
                          const items = rows.filter((c) => c.agent === a);
                          const q = items.filter(isQualified).length;
                          return /* @__PURE__ */ jsx_runtime.jsxs("button", {
                            className: "agent-scorecard " + a,
                            onClick: () => setAgent(a),
                            children: [
                              /* @__PURE__ */ jsx_runtime.jsxs("div", {
                                className: "agent-heading",
                                children: [
                                  /* @__PURE__ */ jsx_runtime.jsx("span", {
                                    className: "lead-monogram " + a,
                                    children: a === "sales" ? "T" : "M"
                                  }),
                                  /* @__PURE__ */ jsx_runtime.jsxs("span", {
                                    children: [
                                      /* @__PURE__ */ jsx_runtime.jsx("strong", {
                                        children: agentName(a)
                                      }),
                                      /* @__PURE__ */ jsx_runtime.jsx("small", {
                                        children: a === "sales" ? "Asesor comercial" : "Orientador de vivienda"
                                      })
                                    ]
                                  }),
                                  /* @__PURE__ */ jsx_runtime.jsx(ArrowUpRight, {
                                    size: 14
                                  })
                                ]
                              }),
                              /* @__PURE__ */ jsx_runtime.jsxs("div", {
                                className: "agent-numbers",
                                children: [
                                  /* @__PURE__ */ jsx_runtime.jsxs("span", {
                                    children: [
                                      /* @__PURE__ */ jsx_runtime.jsx("b", {
                                        children: items.length
                                      }),
                                      "leads"
                                    ]
                                  }),
                                  /* @__PURE__ */ jsx_runtime.jsxs("span", {
                                    children: [
                                      /* @__PURE__ */ jsx_runtime.jsx("b", {
                                        children: q
                                      }),
                                      "calificados¹"
                                    ]
                                  }),
                                  /* @__PURE__ */ jsx_runtime.jsxs("span", {
                                    children: [
                                      /* @__PURE__ */ jsx_runtime.jsx("b", {
                                        children: items.filter((c) => c.stage === "won").length
                                      }),
                                      "ganados"
                                    ]
                                  })
                                ]
                              }),
                              /* @__PURE__ */ jsx_runtime.jsxs("div", {
                                className: "agent-progress",
                                children: [
                                  /* @__PURE__ */ jsx_runtime.jsx("span", {
                                    children: "Calificación"
                                  }),
                                  /* @__PURE__ */ jsx_runtime.jsx("strong", {
                                    children: percent(ratio(q, items.length))
                                  }),
                                  /* @__PURE__ */ jsx_runtime.jsx("div", {
                                    children: /* @__PURE__ */ jsx_runtime.jsx("i", {
                                      style: { width: (ratio(q, items.length) ?? 0) + "%" }
                                    })
                                  })
                                ]
                              })
                            ]
                          }, a);
                        })
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx("p", {
                        className: "card-footnote",
                        children: "¹ Incluye calificados, visita agendada y ganados."
                      }),
                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
                        className: "district-heading",
                        children: [
                          /* @__PURE__ */ jsx_runtime.jsx("h3", {
                            children: "Dónde está el interés"
                          }),
                          /* @__PURE__ */ jsx_runtime.jsxs("span", {
                            children: [
                              /* @__PURE__ */ jsx_runtime.jsx(MapPin, {
                                size: 12
                              }),
                              " Top 3 distritos"
                            ]
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx("div", {
                        className: "district-ranking",
                        children: districts.slice(0, 3).map(([district, items], i) => /* @__PURE__ */ jsx_runtime.jsxs("button", {
                          onClick: () => show("Interés en " + district, items),
                          children: [
                            /* @__PURE__ */ jsx_runtime.jsxs("span", {
                              className: "rank-number",
                              children: [
                                "0",
                                i + 1
                              ]
                            }),
                            /* @__PURE__ */ jsx_runtime.jsx("span", {
                              children: district
                            }),
                            /* @__PURE__ */ jsx_runtime.jsx("b", {
                              children: items.length
                            }),
                            /* @__PURE__ */ jsx_runtime.jsx(ArrowUpRight, {
                              size: 12
                            })
                          ]
                        }, district))
                      })
                    ]
                  })
                ]
              }),
              rows.length === 0 && /* @__PURE__ */ jsx_runtime.jsx("div", {
                className: "empty-cohort",
                role: "status",
                children: "No hay leads en este período y agente. Amplía la fecha o restablece los filtros."
              }),
              /* @__PURE__ */ jsx_runtime.jsxs("footer", {
                className: "insights-footer",
                children: [
                  /* @__PURE__ */ jsx_runtime.jsxs("span", {
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsx("span", {
                        className: "status-dot"
                      }),
                      USE_MOCK ? all.length + " contactos de vista previa" : "Historial sincronizado · Solo lectura",
                      /* @__PURE__ */ jsx_runtime.jsx("span", {
                        className: "footer-divider",
                        children: "·"
                      }),
                      shortDate(model.start),
                      " – ",
                      shortDate(model.end - 1),
                      /* @__PURE__ */ jsx_runtime.jsx("span", {
                        className: "footer-divider",
                        children: "·"
                      }),
                      "Hora de Lima"
                    ]
                  }),
                  /* @__PURE__ */ jsx_runtime.jsxs("button", {
                    onClick: () => setDefinitions(true),
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsx(CircleQuestionMark, {
                        size: 13
                      }),
                      " Cómo se calculan"
                    ]
                  })
                ]
              })
            ]
          })
        ]
      }),
      /* @__PURE__ */ jsx_runtime.jsx(Dialog, {
        open: Boolean(drawer),
        onOpenChange: (open) => {
          if (!open)
            setDrawer(null);
        },
        children: /* @__PURE__ */ jsx_runtime.jsxs(DialogPortal, {
          children: [
            /* @__PURE__ */ jsx_runtime.jsx(DialogOverlay, {
              className: "insights-overlay"
            }),
            /* @__PURE__ */ jsx_runtime.jsxs(DialogContent, {
              className: "insights-drawer",
              children: [
                /* @__PURE__ */ jsx_runtime.jsxs("div", {
                  className: "drawer-top",
                  children: [
                    /* @__PURE__ */ jsx_runtime.jsx("span", {
                      className: "page-eyebrow",
                      children: "DEL DATO A LA CONVERSACIÓN"
                    }),
                    /* @__PURE__ */ jsx_runtime.jsx(DialogClose, {
                      className: "subtle-icon",
                      "aria-label": "Cerrar detalle",
                      children: /* @__PURE__ */ jsx_runtime.jsx(X, {
                        size: 20
                      })
                    })
                  ]
                }),
                /* @__PURE__ */ jsx_runtime.jsx(DialogTitle, {
                  children: drawer?.title
                }),
                /* @__PURE__ */ jsx_runtime.jsx(DialogDescription, {
                  children: drawer?.description
                }),
                /* @__PURE__ */ jsx_runtime.jsxs("div", {
                  className: "drawer-count",
                  children: [
                    drawer?.rows.length ?? 0,
                    " contactos encontrados"
                  ]
                }),
                /* @__PURE__ */ jsx_runtime.jsxs("div", {
                  className: "drawer-leads",
                  children: [
                    drawer?.rows.map((c) => /* @__PURE__ */ jsx_runtime.jsxs("article", {
                      className: "context-lead",
                      children: [
                        /* @__PURE__ */ jsx_runtime.jsxs("div", {
                          className: "context-lead-heading",
                          children: [
                            /* @__PURE__ */ jsx_runtime.jsx("span", {
                              className: "lead-monogram " + c.agent,
                              children: initials(c)
                            }),
                            /* @__PURE__ */ jsx_runtime.jsxs("div", {
                              children: [
                                /* @__PURE__ */ jsx_runtime.jsx("strong", {
                                  children: c.name ?? "Lead sin nombre"
                                }),
                                /* @__PURE__ */ jsx_runtime.jsxs("small", {
                                  children: [
                                    agentName(c.agent),
                                    " · ",
                                    STAGE_META.find((s) => s.stage === c.stage)?.label
                                  ]
                                })
                              ]
                            }),
                            /* @__PURE__ */ jsx_runtime.jsx("span", {
                              className: "score-chip",
                              children: c.intentScore ? c.intentScore + "/5" : "Sin score"
                            })
                          ]
                        }),
                        /* @__PURE__ */ jsx_runtime.jsx("div", {
                          className: "context-tags",
                          children: [profileText(c.profile.district), cash(c.profile.budgetMax), profileText(c.profile.projectInterest)].filter(Boolean).map((t) => /* @__PURE__ */ jsx_runtime.jsx("span", {
                            children: t
                          }, t))
                        }),
                        /* @__PURE__ */ jsx_runtime.jsxs("blockquote", {
                          children: [
                            "“",
                            c.lastMessagePreview,
                            "”"
                          ]
                        }),
                        (profileText(c.profile.notes) || profileText(c.profile.objections)) && /* @__PURE__ */ jsx_runtime.jsxs("div", {
                          className: "memory-note",
                          children: [
                            /* @__PURE__ */ jsx_runtime.jsx(Sparkles, {
                              size: 15
                            }),
                            /* @__PURE__ */ jsx_runtime.jsxs("p", {
                              children: [
                                /* @__PURE__ */ jsx_runtime.jsx("strong", {
                                  children: "Lo que ya sabemos"
                                }),
                                profileText(c.profile.notes) ?? profileText(c.profile.objections)
                              ]
                            })
                          ]
                        }),
                        /* @__PURE__ */ jsx_runtime.jsxs("button", {
                          className: "context-open",
                          onClick: () => {
                            setDrawer(null);
                            onOpen(c.id);
                          },
                          children: [
                            /* @__PURE__ */ jsx_runtime.jsx(MessageSquare, {
                              size: 15
                            }),
                            " Abrir conversación ",
                            /* @__PURE__ */ jsx_runtime.jsx(ArrowRight, {
                              size: 15
                            })
                          ]
                        })
                      ]
                    }, c.id)),
                    !drawer?.rows.length && /* @__PURE__ */ jsx_runtime.jsxs("div", {
                      className: "report-empty",
                      children: [
                        /* @__PURE__ */ jsx_runtime.jsx(Users, {
                          size: 28
                        }),
                        /* @__PURE__ */ jsx_runtime.jsx("strong", {
                          children: "No hay contactos en esta selección"
                        }),
                        /* @__PURE__ */ jsx_runtime.jsx("span", {
                          children: "Prueba otra etapa o cambia los filtros del informe."
                        })
                      ]
                    })
                  ]
                })
              ]
            })
          ]
        })
      }),
      /* @__PURE__ */ jsx_runtime.jsx(Dialog, {
        open: definitions,
        onOpenChange: setDefinitions,
        children: /* @__PURE__ */ jsx_runtime.jsxs(DialogPortal, {
          children: [
            /* @__PURE__ */ jsx_runtime.jsx(DialogOverlay, {
              className: "insights-overlay"
            }),
            /* @__PURE__ */ jsx_runtime.jsxs(DialogContent, {
              className: "definitions-dialog",
              children: [
                /* @__PURE__ */ jsx_runtime.jsx(DialogClose, {
                  className: "subtle-icon definitions-close",
                  "aria-label": "Cerrar definiciones",
                  children: /* @__PURE__ */ jsx_runtime.jsx(X, {
                    size: 20
                  })
                }),
                /* @__PURE__ */ jsx_runtime.jsx(DialogTitle, {
                  children: "Indicadores que puedes entender"
                }),
                /* @__PURE__ */ jsx_runtime.jsx(DialogDescription, {
                  children: "Todos los resultados comparten el filtro de fecha de ingreso y agente."
                }),
                /* @__PURE__ */ jsx_runtime.jsxs("dl", {
                  children: [
                    /* @__PURE__ */ jsx_runtime.jsx("dt", {
                      children: "Leads captados"
                    }),
                    /* @__PURE__ */ jsx_runtime.jsx("dd", {
                      children: "Contactos creados dentro del período. La diferencia compara con el período inmediatamente anterior de la misma duración."
                    }),
                    /* @__PURE__ */ jsx_runtime.jsx("dt", {
                      children: "Calificación"
                    }),
                    /* @__PURE__ */ jsx_runtime.jsx("dd", {
                      children: "Calificados, visitas agendadas y ganados, divididos entre los leads captados. Se usa su estado actual."
                    }),
                    /* @__PURE__ */ jsx_runtime.jsx("dt", {
                      children: "Por retomar"
                    }),
                    /* @__PURE__ */ jsx_runtime.jsx("dd", {
                      children: "Leads activos con una fecha de seguimiento vencida. Ganados y perdidos están excluidos."
                    }),
                    /* @__PURE__ */ jsx_runtime.jsx("dt", {
                      children: "Por atender"
                    }),
                    /* @__PURE__ */ jsx_runtime.jsx("dd", {
                      children: "Seguimientos vencidos o conversaciones cuyo último mensaje entrante es posterior al último saliente."
                    }),
                    /* @__PURE__ */ jsx_runtime.jsx("dt", {
                      children: "Alcance de los datos"
                    }),
                    /* @__PURE__ */ jsx_runtime.jsxs("dd", {
                      children: [
                        USE_MOCK ? "Esta vista previa usa 8 contactos compartidos con la bandeja. " : "La fuente es Supabase: contacts, messages, conversations, lead_profiles, follow_ups y appointments. Acceso de solo lectura. ",
                        "La retención y la conversión histórica entre etapas requieren eventos adicionales; no se estiman aquí."
                      ]
                    })
                  ]
                })
              ]
            })
          ]
        })
      })
    ]
  });
}

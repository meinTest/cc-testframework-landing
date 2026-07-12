// Bilingual landing-page copy (Phase 1). UI strings are user-facing and may be
// German; identifiers, keys, and comments stay English per project convention.

export type Lang = "de" | "en";

export const LANGS: Lang[] = ["de", "en"];

/** Resolve a `?lang=` search-param value to a supported Lang. Defaults to German. */
export function resolveLang(value?: string | string[]): Lang {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "en" ? "en" : "de";
}

/** Append/override the `lang` query param on an internal href. */
export function withLang(href: string, lang: Lang): string {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("lang", lang);
  return `${path}?${params.toString()}`;
}

type ProductCard = {
  name: string;
  tagline: string;
  blurb: string;
};

type ProductDetail = {
  name: string;
  tagline: string;
  description: string;
  features: string[];
};

export interface PricingCopy {
  title: string;
  subtitle: string;
  cycleMonthly: string;
  cycleYearly: string;
  yearlyNote: string;
  perUserMonth: string;
  perUserYear: string;
  currencyLabel: string;
  recommended: string;
  trial: {
    name: string;
    price: string;
    tagline: string;
    features: string[];
    cta: string;
  };
  subscription: {
    name: string;
    tagline: string;
    features: string[];
    cta: string;
  };
  onetime: {
    name: string;
    price: string;
    tagline: string;
    features: string[];
    cta: string;
  };
}

type Copy = {
  htmlLang: string;
  nav: {
    overview: string;
    backToOverview: string;
  };
  common: {
    learnMore: string;
    requestDemo: string;
    startTrial: string;
    documentation: string;
    docsComingSoon: string;
    alreadyCustomer: string;
    contactSales: string;
    seePricing: string;
  };
  overview: {
    title: string;
    subtitle: string;
    framework: ProductCard;
    mgmt: ProductCard;
  };
  framework: ProductDetail;
  mgmt: ProductDetail;
  pricing: PricingCopy;
};

export const content: Record<Lang, Copy> = {
  de: {
    htmlLang: "de",
    nav: {
      overview: "Übersicht",
      backToOverview: "← Übersicht",
    },
    common: {
      learnMore: "Mehr erfahren",
      requestDemo: "Demo anfragen",
      startTrial: "14-Tage-Trial starten",
      documentation: "Dokumentation",
      docsComingSoon: "Dokumentation folgt.",
      alreadyCustomer: "Schon Kunde?",
      contactSales: "Vertrieb kontaktieren",
      seePricing: "Preise ansehen",
    },
    overview: {
      title: "Zwei Werkzeuge für konsistentes Testen",
      subtitle:
        "Vom Framework bis zur Management-Oberfläche — eine durchgängige Test-Toolchain für Web, Desktop und Mobile.",
      framework: {
        name: "CC-Testframework",
        tagline: "TypeScript-Test-Framework mit eingebauten Konventionen",
        blurb:
          "Playwright und Appium unter einer Oberfläche. Namensgebung, Struktur und Reporting sind vorkonfiguriert — Testcode bleibt teamübergreifend konsistent.",
      },
      mgmt: {
        name: "CC Test Management",
        tagline: "Test-Specs verwalten — ganz ohne Git-Handgriffe",
        blurb:
          "Lokale Windows-App, in der Fachtester TypeScript-Test-Specs bearbeiten. Git-Operationen laufen unsichtbar im Hintergrund. Nutzt CC-Testframework als Ausführungs-Engine.",
      },
    },
    framework: {
      name: "CC-Testframework",
      tagline:
        "TypeScript-Test-Framework mit eingebauten Konventionen für Web, Desktop und Mobile.",
      description:
        "Playwright und Appium unter einer gemeinsamen Oberfläche. Namensgebung, Struktur und Reporting sind ab Werk vorverdrahtet, damit Testcode teamübergreifend konsistent bleibt.",
      features: [
        "Web, Desktop & Mobile: Playwright und Appium hinter einer einheitlichen API.",
        "Konventionen vorverdrahtet: Namensgebung, Projektstruktur und Reporting ab Werk.",
        "Konsistenz über Teams: Testcode bleibt lesbar und wartbar — egal, wer schreibt.",
      ],
    },
    mgmt: {
      name: "CC Test Management",
      tagline: "Git-basiertes Test-Management als lokale Windows-App.",
      description:
        "CC Test Management ist ein Git-basiertes Test-Management-Tool als lokale Windows-Anwendung (WebView2). Fachtester bearbeiten TypeScript-Test-Specs in einer Oberfläche auf localhost — commit, push, pull und Pull-Requests laufen automatisch im Hintergrund. Als Ausführungs-Engine dient das CC-Testframework.",
      features: [
        "Kein Git-Wissen nötig: Versionierung passiert unsichtbar im Hintergrund.",
        "Für Fachtester gebaut: TypeScript-Test-Specs bearbeiten statt Tooling bedienen.",
        "Integriert: CC-Testframework als Ausführungs-Engine inklusive.",
        
      ],
    },
    pricing: {
      title: "Preise",
      subtitle: "Pro User und Lizenz — jederzeit kündbar. Nicht gerätegebunden.",
      cycleMonthly: "Monatlich",
      cycleYearly: "Jährlich",
      yearlyNote: "{pct}% gespart",
      perUserMonth: "/ User · Monat",
      perUserYear: "/ User · Jahr",
      currencyLabel: "Währung",
      recommended: "Empfohlen",
      trial: {
        name: "Trial",
        price: "Kostenlos",
        tagline: "14 Tage unverbindlich testen",
        features: [
          "Voller Funktionsumfang",
          "Keine Zahlungsdaten nötig",
          "Läuft automatisch aus",
        ],
        cta: "Trial anfragen",
      },
      subscription: {
        name: "Abo",
        tagline: "Monatlich oder jährlich, pro User",
        features: [
          "Pro User lizenziert",
          "Kreditkarte oder Rechnung",
          "Updates & Support inklusive",
        ],
        cta: "Abo starten",
      },
      onetime: {
        name: "Einmalkauf",
        price: "Preis auf Anfrage",
        tagline: "Unbefristete Lizenz",
        features: [
          "Unbefristete Nutzung",
          "Individuelles Angebot",
          "Ideal für feste Setups",
        ],
        cta: "Angebot anfragen",
      },
    },
  },
  en: {
    htmlLang: "en",
    nav: {
      overview: "Overview",
      backToOverview: "← Overview",
    },
    common: {
      learnMore: "Learn more",
      requestDemo: "Request a demo",
      startTrial: "Start 14-day trial",
      documentation: "Documentation",
      docsComingSoon: "Documentation coming soon.",
      alreadyCustomer: "Already a customer?",
      contactSales: "Contact sales",
      seePricing: "See pricing",
    },
    overview: {
      title: "Two tools for consistent testing",
      subtitle:
        "From framework to management UI — one continuous test toolchain for Web, Desktop, and Mobile.",
      framework: {
        name: "CC-Testframework",
        tagline: "TypeScript test framework with built-in conventions",
        blurb:
          "Playwright and Appium under one surface. Naming, structure, and reporting come pre-wired — test code stays consistent across teams.",
      },
      mgmt: {
        name: "CC Test Management",
        tagline: "Manage test specs — without touching Git",
        blurb:
          "A local Windows app where functional testers edit TypeScript test specs. Git operations run invisibly in the background. Uses CC-Testframework as its execution engine.",
      },
    },
    framework: {
      name: "CC-Testframework",
      tagline:
        "TypeScript-based test framework with built-in conventions for Web, Desktop, and Mobile.",
      description:
        "Playwright and Appium under one surface. Naming, structure, and reporting conventions come pre-wired so test code stays consistent across teams.",
      features: [
        "Web, Desktop & Mobile: Playwright and Appium behind one unified API.",
        "Conventions pre-wired: naming, project structure, and reporting out of the box.",
        "Consistency across teams: test code stays readable and maintainable, whoever writes it.",
      ],
    },
    mgmt: {
      name: "CC Test Management",
      tagline: "Git-based test management as a local Windows app.",
      description:
        "CC Test Management is a Git-based test management tool delivered as a local Windows application (WebView2). Functional testers edit TypeScript test specs in a UI on localhost — commit, push, pull, and pull requests run automatically in the background. It uses CC-Testframework as its execution engine.",
      features: [
        "No Git knowledge required: versioning happens invisibly in the background.",
        "Built for functional testers: edit TypeScript test specs instead of operating tooling.",
        "Integrated: CC-Testframework included as the execution engine.",

      ],
    },
    pricing: {
      title: "Pricing",
      subtitle: "Per user and license — cancel anytime. Not device-bound.",
      cycleMonthly: "Monthly",
      cycleYearly: "Yearly",
      yearlyNote: "Save {pct}%",
      perUserMonth: "/ user · month",
      perUserYear: "/ user · year",
      currencyLabel: "Currency",
      recommended: "Recommended",
      trial: {
        name: "Trial",
        price: "Free",
        tagline: "14 days, no commitment",
        features: [
          "Full feature set",
          "No payment details required",
          "Expires automatically",
        ],
        cta: "Request trial",
      },
      subscription: {
        name: "Subscription",
        tagline: "Monthly or yearly, per user",
        features: [
          "Licensed per user",
          "Credit card or invoice",
          "Updates & support included",
        ],
        cta: "Start subscription",
      },
      onetime: {
        name: "One-time purchase",
        price: "Price on request",
        tagline: "Perpetual license",
        features: [
          "Perpetual use",
          "Custom quote",
          "Ideal for fixed setups",
        ],
        cta: "Request a quote",
      },
    },
  },
};

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
  // Cross-sell footer on each product's pricing page → the Professional bundle.
  bundle: {
    title: string;
    body: string;
    cta: string;
  };
}

export interface SignupCopy {
  // form
  startHeading: string;
  activateHeading: string;
  subtitle: string;
  fullName: string;
  workEmail: string;
  company: string;
  activatingFor: string;
  requestTrial: string;
  activateTrial: string;
  submitting: string;
  consent: string;
  thankYou: string;
  questionsReach: string;
  successFramework: string;
  successTmgmt: string;
  // Professional (BOTH) plan mode: seat selection + bundle wording.
  professional: {
    heading: string;
    subtitle: string;
    seatsTitle: string;
    seatsFramework: string;
    seatsFrameworkHint: string;
    seatsTmt: string;
    seatsTmtHint: string;
    cta: string;
    success: string;
  };
  errorGeneric: string;
  // page states (disclaimer + token errors)
  disabledTitle: string;
  disabledBody: string;
  linkRequiredTitle: string;
  linkRequiredBody: string;
  unavailableTitle: string;
  unavailableBody: string;
  invalidTitle: string;
  invalidBody: string;
  expiredTitle: string;
  expiredBody: string;
  requestDemoCta: string;
  needHelp: string;
  contactForQuestions: string;
}

export interface DemoRequestCopy {
  heading: string;
  subtitle: string;
  productLabel: string;
  fullName: string;
  workEmail: string;
  company: string;
  useCase: string;
  useCaseHint: string;
  submitting: string;
  submit: string;
  thankYou: string;
  success: string;
  reachOutFrom: string;
  errorGeneric: string;
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
    professional: ProductCard;
  };
  framework: ProductDetail;
  mgmt: ProductDetail;
  pricing: PricingCopy;
  signup: SignupCopy;
  demoRequest: DemoRequestCopy;
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
        name: "Verify Test Management",
        tagline: "Test-Specs verwalten — ganz ohne Git-Handgriffe",
        blurb:
          "Lokale Windows-App, in der Fachtester TypeScript-Test-Specs bearbeiten. Git-Operationen laufen unsichtbar im Hintergrund. Nutzt CC-Testframework als Ausführungs-Engine.",
      },
      professional: {
        name: "Professional",
        tagline: "Beide Produkte in einem Trial",
        blurb:
          "CC-Testframework und Verify Test Management zusammen — Seats pro Produkt frei wählbar (parallele Runs fürs Framework, Nutzer für Verify). Ein Trial, ein Abo, eine Willkommens-Mail.",
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
      name: "Verify Test Management",
      tagline: "Git-basiertes Test-Management als lokale Windows-App.",
      description:
        "Verify Test Management ist ein Git-basiertes Test-Management-Tool als lokale Windows-Anwendung (WebView2). Fachtester bearbeiten TypeScript-Test-Specs in einer Oberfläche auf localhost — commit, push, pull und Pull-Requests laufen automatisch im Hintergrund. Als Ausführungs-Engine dient das CC-Testframework.",
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
      bundle: {
        title: "Beide Produkte brauchen?",
        body: "Professional bündelt CC-Testframework und Verify Test Management in einem Trial — Seats pro Produkt frei wählbar.",
        cta: "Professional-Trial starten",
      },
    },
    signup: {
      startHeading: "Trial starten",
      activateHeading: "Trial aktivieren",
      subtitle: "14 Tage, voller Funktionsumfang, keine Zahlungsdaten nötig.",
      fullName: "Vollständiger Name",
      workEmail: "Geschäftliche E-Mail",
      company: "Firma",
      activatingFor: "Trial wird aktiviert für",
      requestTrial: "Trial anfragen",
      activateTrial: "Trial aktivieren",
      submitting: "Wird gesendet…",
      consent:
        "Mit dem Absenden erklärst du dich einverstanden, bezüglich deines Trials kontaktiert zu werden.",
      thankYou: "Danke",
      questionsReach: "Bei Fragen wende dich an",
      successFramework:
        "Trial aktiviert. Prüfe deine E-Mails für deinen Lizenzschlüssel und die Einrichtungshinweise.",
      successTmgmt:
        "Trial aktiviert. Prüfe deine E-Mails für deine Download-Links und deinen Zugangscode.",
      professional: {
        heading: "Professional-Trial starten",
        subtitle:
          "CC-Testframework + Verify Test Management. 14 Tage, voller Funktionsumfang, keine Zahlungsdaten nötig.",
        seatsTitle: "Seats pro Produkt",
        seatsFramework: "CC-Testframework",
        seatsFrameworkHint: "Parallele Test-Runs (ein Lizenzschlüssel)",
        seatsTmt: "Verify Test Management",
        seatsTmtHint: "Nutzer (ein Zugangscode je Seat)",
        cta: "Professional-Trial starten",
        success:
          "Trial aktiviert. Prüfe deine E-Mails — eine Nachricht mit deinem Framework-Schlüssel und allen Verify-Zugangscodes.",
      },
      errorGeneric:
        "Etwas ist schiefgelaufen. Bitte versuche es erneut oder kontaktiere support@itsbusiness.ch.",
      disabledTitle: "Dienst vorübergehend nicht verfügbar",
      disabledBody:
        "Dieser Dienst ist derzeit deaktiviert. Wir schalten ihn zukünftig frei.",
      linkRequiredTitle: "Signup-Link erforderlich",
      linkRequiredBody:
        "Um einen Trial zu starten, fordere bitte zuerst eine Demo an. Der Vertrieb sendet dir einen personalisierten Signup-Link.",
      unavailableTitle: "Signup vorübergehend nicht verfügbar",
      unavailableBody:
        "Wir konnten deinen Signup-Link nicht validieren. Bitte versuche es gleich nochmal oder kontaktiere support@itsbusiness.ch.",
      invalidTitle: "Ungültiger oder bereits genutzter Link",
      invalidBody:
        "Dieser Signup-Link ist nicht mehr gültig. Bitte fordere eine neue Demo an, um einen neuen Link zu erhalten.",
      expiredTitle: "Signup-Link abgelaufen",
      expiredBody:
        "Dieser Signup-Link ist abgelaufen. Bitte fordere eine neue Demo an, um einen neuen Link zu erhalten.",
      requestDemoCta: "Demo anfragen",
      needHelp: "Brauchst du Hilfe? Kontaktiere",
      contactForQuestions: "Bei Fragen kontaktiere bitte",
    },
    demoRequest: {
      heading: "Demo anfragen",
      subtitle:
        "Erzähl uns kurz etwas über dein Team, dann senden wir dir innerhalb eines Werktags einen personalisierten Trial-Link.",
      productLabel: "Produkt:",
      fullName: "Vollständiger Name",
      workEmail: "Geschäftliche E-Mail",
      company: "Firma",
      useCase: "Anwendungsfall",
      useCaseHint: "Ein bis drei Sätze dazu, was du testen möchtest.",
      submitting: "Wird gesendet…",
      submit: "Trial-Link anfragen",
      thankYou: "Danke",
      success: "Anfrage erhalten. Wir melden uns innerhalb eines Werktags.",
      reachOutFrom: "Wir melden uns von",
      errorGeneric:
        "Etwas ist schiefgelaufen. Bitte versuche es erneut oder kontaktiere support@itsbusiness.ch.",
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
        name: "Verify Test Management",
        tagline: "Manage test specs — without touching Git",
        blurb:
          "A local Windows app where functional testers edit TypeScript test specs. Git operations run invisibly in the background. Uses CC-Testframework as its execution engine.",
      },
      professional: {
        name: "Professional",
        tagline: "Both products in one trial",
        blurb:
          "CC-Testframework and Verify Test Management together — seats are chosen per product (parallel runs for the framework, users for Verify). One trial, one subscription, one welcome email.",
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
      name: "Verify Test Management",
      tagline: "Git-based test management as a local Windows app.",
      description:
        "Verify Test Management is a Git-based test management tool delivered as a local Windows application (WebView2). Functional testers edit TypeScript test specs in a UI on localhost — commit, push, pull, and pull requests run automatically in the background. It uses CC-Testframework as its execution engine.",
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
      bundle: {
        title: "Need both products?",
        body: "Professional bundles CC-Testframework and Verify Test Management in one trial — seats chosen per product.",
        cta: "Start Professional trial",
      },
    },
    signup: {
      startHeading: "Start your trial",
      activateHeading: "Activate your trial",
      subtitle: "14 days, full feature set, no payment information required.",
      fullName: "Full name",
      workEmail: "Work email",
      company: "Company",
      activatingFor: "Activating trial for",
      requestTrial: "Request trial",
      activateTrial: "Activate trial",
      submitting: "Submitting…",
      consent: "By submitting you agree to be contacted regarding your trial.",
      thankYou: "Thank you",
      questionsReach: "For questions reach out to",
      successFramework:
        "Trial activated. Check your email for your license key and setup instructions.",
      successTmgmt:
        "Trial activated. Check your email for your download links and access code.",
      professional: {
        heading: "Start your Professional trial",
        subtitle:
          "CC-Testframework + Verify Test Management. 14 days, full feature set, no payment information required.",
        seatsTitle: "Seats per product",
        seatsFramework: "CC-Testframework",
        seatsFrameworkHint: "Parallel test runs (one license key)",
        seatsTmt: "Verify Test Management",
        seatsTmtHint: "Users (one access code per seat)",
        cta: "Start Professional trial",
        success:
          "Trial activated. Check your email — one message with your framework key and all Verify access codes.",
      },
      errorGeneric:
        "Something went wrong. Please try again or contact support@itsbusiness.ch.",
      disabledTitle: "Service temporarily unavailable",
      disabledBody:
        "This service is currently disabled. We will enable it in the future.",
      linkRequiredTitle: "Signup link required",
      linkRequiredBody:
        "To start a trial, please request a demo first. Sales will send you a personalized signup link.",
      unavailableTitle: "Signup temporarily unavailable",
      unavailableBody:
        "We could not validate your signup link. Please try again in a moment or contact support@itsbusiness.ch.",
      invalidTitle: "Invalid or already used link",
      invalidBody:
        "This signup link is no longer valid. Please request a fresh demo to receive a new link.",
      expiredTitle: "Signup link expired",
      expiredBody:
        "This signup link has expired. Please request a fresh demo to receive a new link.",
      requestDemoCta: "Request a demo",
      needHelp: "Need help? Contact",
      contactForQuestions: "For questions please contact",
    },
    demoRequest: {
      heading: "Request a demo",
      subtitle:
        "Tell us a bit about your team and we will send you a personalized trial link within one business day.",
      productLabel: "Product:",
      fullName: "Full name",
      workEmail: "Work email",
      company: "Company",
      useCase: "Use case",
      useCaseHint: "One to three sentences on what you would like to test.",
      submitting: "Submitting…",
      submit: "Request trial link",
      thankYou: "Thank you",
      success: "Request received. We will get back to you within one business day.",
      reachOutFrom: "We will reach out from",
      errorGeneric:
        "Something went wrong. Please try again or contact support@itsbusiness.ch.",
    },
  },
};

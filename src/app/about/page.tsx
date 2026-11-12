import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: "Shithanshu Mishra: backend and distributed-systems engineer. Career timeline, technical domains and working principles.",
  alternates: { canonical: absoluteUrl("/about/") },
};

// Source of truth: the author's resume. Do not add claims that are not in it.
const roles = [
  {
    org: "Beltech AI", place: "Bengaluru", span: "Apr 2021 – present",
    positions: [
      {
        title: "Senior Software Engineer — Founding Engineer", span: "Mar 2024 – present",
        points: [
          "Led end-to-end backend architecture for a multi-tenant AI platform serving smart-city and government clients, owning data modelling, API design, deployment and production operations across Python and Java services.",
          "Designed a payment-grade financial platform: immutable ACID ledger, low-latency state management, prepaid wallets and automated reconciliation.",
          "Engineered an in-house distributed workflow engine (Spring Boot and Node.js) handling 10M+ tasks per day, with durable state, rate limiting, back-pressure and horizontal scaling.",
          "Built a real-time traffic-analytics pipeline on Kafka, MQTT and ksqlDB with sub-second processing latency and back-pressure handling.",
          "Built a WebSocket notification system holding 1,000+ concurrent persistent connections for time-critical alert delivery.",
          "Architected Spring Boot microservices for a Video Management System designed for 100k+ IP cameras with 24×7 availability and multi-tenant isolation.",
          "Delivered ETL and change-data-capture pipelines with Debezium, Kafka and Elasticsearch for near-real-time analytics and audit trails.",
          "Led a Kubernetes migration and GPU-enabled CI/CD shift from AWS to a private datacentre; mentored three engineers using RFC-first, documentation-first practice.",
        ],
      },
      {
        title: "Software Engineer", span: "Apr 2021 – Feb 2024",
        points: [
          "Built backend services and distributed modules for intelligent traffic management and smart-city platforms, from prototype to production.",
          "Designed low-network Python fare-calculation modules for intermittent connectivity, enforcing correctness under partial failure.",
          "Designed a Python traffic-management solution with an MTBF above 262,000 hours.",
        ],
      },
    ],
  },
  {
    org: "Hitachi Vantara", place: "Pune", span: "Nov 2020 – Apr 2021",
    positions: [{ title: "Associate", span: "", points: ["Built an automated monitoring and alerting system in Python for SAP applications, saving 1,000+ man-hours.", "Managed an SAP R/3 system migration and kept production operations stable."] }],
  },
];

const domains: [string, string][] = [
  ["Streaming and real-time", "Kafka, MQTT, ksqlDB, Debezium CDC, WebSockets, back-pressure, long-lived connections"],
  ["Data stores", "PostgreSQL (schema design, query optimisation, ACID), MySQL, MongoDB, Elasticsearch, Redis"],
  ["Orchestration and commerce", "Queue-based durable task processing, event-driven state machines, ledger design, metering, reconciliation"],
  ["Platform and operations", "Kubernetes, Docker, AWS, CI/CD, GPU pipelines, structured logging, metrics, distributed tracing"],
  ["Languages and frameworks", "Python (FastAPI, Flask), Java 17+ (Spring Boot), JavaScript/Node.js"],
];

export default function Page() {
  return (
    <div className="wrap pt-14">
      <header className="grid gap-4 md:grid-cols-12 mb-14">
        <p className="section-no md:col-span-2">§ About</p>
        <div className="md:col-span-9">
          <h1 className="font-serif text-5xl md:text-6xl font-medium tracking-tight leading-[1.02]">Greenfield systems, taken to commercial-grade production.</h1>
          <p className="mt-6 max-w-2xl font-serif text-xl leading-snug text-ink-2">Backend engineer with five-plus years designing and operating multi-tenant distributed systems, from real-time streaming and WebSocket infrastructure to transactional platforms. Founding engineer with full-stack ownership across data modelling, API design, workflow orchestration, observability and production operations. Based in {site.location}.</p>
        </div>
      </header>

      <section aria-labelledby="exp" className="grid gap-x-12 gap-y-6 border-t-2 border-ink pt-4 md:grid-cols-12">
        <h2 id="exp" className="meta md:col-span-2">Experience</h2>
        <div className="md:col-span-10 space-y-14">
          {roles.map((r) => (
            <div key={r.org}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-2">
                <h3 className="font-serif text-3xl font-medium">{r.org}</h3>
                <p className="meta">{r.place} · {r.span}</p>
              </div>
              {r.positions.map((p) => (
                <div key={p.title} className="mt-6 grid gap-x-8 gap-y-2 md:grid-cols-[14rem_1fr]">
                  <div><p className="font-sans font-semibold text-sm">{p.title}</p>{p.span && <p className="meta mt-1">{p.span}</p>}</div>
                  <ul className="space-y-2.5 list-square pl-0 text-[1.02rem] leading-snug max-w-2xl">
                    {p.points.map((t) => <li key={t} className="relative pl-5 before:absolute before:left-0 before:top-[0.6em] before:h-1.5 before:w-1.5 before:bg-signal">{t}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="dom" className="mt-16 grid gap-x-12 gap-y-6 border-t-2 border-ink pt-4 md:grid-cols-12">
        <h2 id="dom" className="meta md:col-span-2">Technical domains</h2>
        <dl className="md:col-span-10 divide-y divide-rule">
          {domains.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-3 md:grid-cols-[14rem_1fr] md:gap-8"><dt className="font-sans font-semibold text-sm">{k}</dt><dd className="max-w-2xl">{v}</dd></div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="lead" className="mt-16 grid gap-x-12 gap-y-6 border-t-2 border-ink pt-4 md:grid-cols-12">
        <h2 id="lead" className="meta md:col-span-2">Working principles</h2>
        <div className="md:col-span-10 max-w-2xl space-y-5 text-[1.08rem]">
          <p>Decisions are written down before code is, as RFCs, so they can be argued with. Reliability is designed in at the data-model and failure-handling level, not added after launch.</p>
          <p>Prototypes become production under real latency and availability targets, which is why the journal here leans on failure modes, back-pressure and recovery rather than happy paths.</p>
          <p>Work with government stakeholders has meant translating distributed-systems trade-offs for non-technical audiences, including live demonstrations to senior officials, and handling the contractual and compliance side of delivery.</p>
        </div>
      </section>

      <section aria-labelledby="edu" className="mt-16 grid gap-x-12 gap-y-6 border-t-2 border-ink pt-4 md:grid-cols-12">
        <h2 id="edu" className="meta md:col-span-2">Education</h2>
        <p className="md:col-span-10">Bachelor of Engineering, Computer Science — Pune University, 2016–2020. CGPA 9.31/10.</p>
      </section>

      <p className="mt-16 font-serif text-xl">See the <Link className="link" href="/projects/">projects</Link> and the <Link className="link" href="/journal/">journal</Link>, or <Link className="link" href="/contact/">get in touch</Link>.</p>
    </div>
  );
}

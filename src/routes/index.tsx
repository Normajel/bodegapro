import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IntegraStock ERP | Tu operación, conectada" },
      {
        name: "description",
        content:
          "Conecta compras, inventario y recepción en IntegraStock ERP. Gestión de bodega para constructoras y contratistas.",
      },
      { property: "og:title", content: "IntegraStock ERP | Tu operación, conectada" },
      {
        property: "og:description",
        content:
          "Tu bodega en orden. Tu negocio en movimiento. Inventario, compras y trazabilidad en un solo lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LandingPage,
});

const STAGES = [
  {
    status: "Por aprobar",
    note: "Crea la orden con productos, cantidades y proveedor. Queda disponible para revisión de gerencia.",
  },
  {
    status: "Pendiente de recepción",
    note: "Gerencia revisa y aprueba la orden. Bodega puede identificar los productos pendientes de recibir.",
  },
  {
    status: "Recibida completa",
    note: "Bodega registra la recepción vinculada a la orden. Las cantidades recibidas actualizan el inventario.",
  },
] as const;

// Scope every rule to the public landing page so authenticated screens keep their styles.
const landingStyles =
  ".integrastock-landing{--navy:#102f45;--deep:#092334;--teal:#10b7ad;--muted:#667d88}.integrastock-landing *{box-sizing:border-box}.integrastock-landing{scroll-behavior:smooth;scroll-padding-top:90px}.integrastock-landing{margin:0;font-family:Arial,Helvetica,sans-serif;color:var(--navy);background:#fff}.integrastock-landing a{color:inherit;text-decoration:none}.integrastock-landing button{font:inherit;cursor:pointer}.integrastock-landing header{height:92px;display:flex;align-items:center;justify-content:space-between;max-width:1240px;margin:auto;padding:0 32px}.integrastock-landing .brand{font-size:25px;font-weight:800;letter-spacing:-1px;display:flex;gap:10px;align-items:center}.integrastock-landing .brand small{display:block;font-size:9px;letter-spacing:3.5px;margin-top:4px;color:var(--muted)}.integrastock-landing .mark{display:grid;place-items:center;background:var(--teal);color:white;width:39px;height:42px;border-radius:9px;font-size:27px}.integrastock-landing .brand em{font-style:normal;color:#0a9f97}.integrastock-landing nav{display:flex;gap:32px;align-items:center;font-size:13px;font-weight:600}.integrastock-landing .btn{display:inline-flex;align-items:center;justify-content:center;gap:22px;padding:16px 23px;border-radius:5px;background:var(--teal);color:var(--deep);font-weight:700;font-size:13px;border:1px solid transparent;transition:.2s}.integrastock-landing .btn:hover{background:#38d4c9;transform:translateY(-2px)}.integrastock-landing .btn.dark{background:var(--navy);color:white}.integrastock-landing .btn.outline{background:transparent;border-color:#ffffff50;color:white}.integrastock-landing .menu{display:none;background:none;border:0;font-size:25px}.integrastock-landing .hero{position:relative;background:var(--deep);color:white;overflow:hidden}.integrastock-landing .hero:before{content:'';position:absolute;background:#103c50;inset:0 44% 0 0;clip-path:polygon(0 0,75% 0,100% 100%,0 100%)}.integrastock-landing .hero-inner{max-width:1240px;margin:auto;padding:80px 32px 75px;display:grid;grid-template-columns:1fr 1fr;gap:35px;align-items:center;position:relative}.integrastock-landing .eyebrow{text-transform:uppercase;font-size:10px;letter-spacing:2px;font-weight:700;color:#74ddd5;display:flex;gap:10px;align-items:center}.integrastock-landing .eyebrow:before{content:'';width:22px;height:2px;background:var(--teal)}.integrastock-landing h1{font-size:clamp(40px,4.5vw,63px);line-height:1.07;letter-spacing:-2.6px;margin:26px 0}.integrastock-landing h1 span{color:#4bd2c5}.integrastock-landing .intro{font-size:16px;line-height:1.8;color:#b9cbd4;max-width:430px}.integrastock-landing .actions{display:flex;gap:13px;margin-top:30px}.integrastock-landing .hero-foot{display:flex;gap:21px;font-size:11px;color:#b9cbd4;margin-top:32px}.integrastock-landing .hero-foot b{color:#5ad7c8;margin-right:6px}.integrastock-landing .visual{position:relative;min-width:0}.integrastock-landing .scene{width:100%;height:360px;display:block}.integrastock-landing .float{position:absolute;background:#fff;color:var(--navy);padding:18px;border-radius:8px;box-shadow:0 16px 40px #0003;font-size:12px}.integrastock-landing .float small{display:block;color:var(--muted);font-size:10px;margin:7px 0}.integrastock-landing .float.one{top:10px;right:0}.integrastock-landing .float.two{bottom:0;left:16px}.integrastock-landing .dot{color:#089d85}.integrastock-landing .strip{background:#f1f6f6;border-bottom:1px solid #e2ebed}.integrastock-landing .strip-inner{max-width:1176px;margin:auto;display:flex;justify-content:space-between;padding:25px 0;gap:20px;font-size:12px;color:#6b8089}.integrastock-landing .strip strong{color:var(--navy)}.integrastock-landing section.content{max-width:1240px;margin:auto;padding:90px 32px}.integrastock-landing .section-top{display:flex;justify-content:space-between;align-items:end;gap:50px;margin-bottom:40px}.integrastock-landing .kicker{font-size:10px;letter-spacing:2px;font-weight:700;color:#06998f;text-transform:uppercase}.integrastock-landing h2{font-size:36px;line-height:1.18;letter-spacing:-1.2px;margin:16px 0}.integrastock-landing p{line-height:1.75}.integrastock-landing .section-top p{max-width:360px;color:var(--muted);font-size:14px}.integrastock-landing .features{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid #dce6e9;border-bottom:1px solid #dce6e9}.integrastock-landing .feature{padding:30px 25px 28px;border-right:1px solid #dce6e9}.integrastock-landing .feature:first-child{padding-left:0}.integrastock-landing .feature:last-child{border:0}.integrastock-landing .icon{font-size:25px;color:#0aa89e;margin-bottom:28px}.integrastock-landing .feature h3{font-size:17px}.integrastock-landing .feature p{font-size:13px;color:var(--muted)}.integrastock-landing .feature .num{font-size:10px;letter-spacing:1px;color:#92a5ac}.integrastock-landing .flow{background:#f3f7f7}.integrastock-landing .flow-inner{max-width:1240px;margin:auto;padding:75px 32px;display:grid;grid-template-columns:.85fr 1.15fr;gap:75px;align-items:center}.integrastock-landing .flow p{color:var(--muted);font-size:14px}.integrastock-landing .tabs{display:flex;gap:8px;flex-wrap:wrap;margin-top:26px}.integrastock-landing .tabs button{border:1px solid #d9e4e5;background:white;color:var(--navy);border-radius:4px;padding:12px 16px;font-size:12px}.integrastock-landing .tabs button[aria-pressed=true]{background:var(--navy);border-color:var(--navy);color:white}.integrastock-landing .panel{background:white;box-shadow:0 18px 50px #133e4810;border:1px solid #e1e9e9;border-radius:10px;padding:25px}.integrastock-landing .panel-top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eef2f3;padding-bottom:20px;font-size:14px}.integrastock-landing .badge{font-size:9px;letter-spacing:1px;color:#83949c}.integrastock-landing .order{background:#f4f8f8;border-radius:5px;padding:18px;display:flex;justify-content:space-between;font-size:12px;margin:20px 0}.integrastock-landing .pill{color:#078877;background:#daf4eb;padding:6px 8px;border-radius:20px;font-size:10px}.integrastock-landing .steps{display:flex;justify-content:space-between;margin:28px 0}.integrastock-landing .step{font-size:10px;color:#78909a;text-align:center;flex:1;position:relative}.integrastock-landing .step:before{content:'';height:2px;background:#dce9e9;position:absolute;top:13px;left:0;right:0}.integrastock-landing .step b{display:grid;position:relative;margin:0 auto 12px;place-items:center;border-radius:50%;width:28px;height:28px;background:#e5eded;color:#718991}.integrastock-landing .step.done b{background:var(--teal);color:white}.integrastock-landing .panel-note{padding:13px;background:#eff8f6;border-radius:5px;font-size:11px!important;margin:0}.integrastock-landing .bottom{max-width:1176px;margin:75px auto;background:var(--navy);border-radius:9px;padding:43px 48px;display:flex;justify-content:space-between;align-items:center;color:white}.integrastock-landing .bottom h2{font-size:29px;margin:0 0 13px}.integrastock-landing .bottom p{font-size:13px;color:#bed0d9;margin:0}.integrastock-landing footer{max-width:1240px;margin:auto;padding:25px 32px 35px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e5eded;font-size:11px;color:var(--muted)}.integrastock-landing footer .brand{font-size:19px}.integrastock-landing a:focus-visible,.integrastock-landing button:focus-visible{outline:3px solid #f4b55a;outline-offset:5px}@media(max-width:800px){.integrastock-landing header{height:77px;padding:0 22px}.integrastock-landing .brand{font-size:22px}.integrastock-landing nav{display:none;position:absolute;top:77px;left:0;right:0;background:white;padding:25px;z-index:5;box-shadow:0 15px 25px #0002}.integrastock-landing nav.open{display:flex;flex-direction:column}.integrastock-landing .menu{display:block}.integrastock-landing .hero-inner{grid-template-columns:1fr;padding:48px 23px 40px;gap:35px}.integrastock-landing h1{font-size:46px}.integrastock-landing .hero:before{inset:0;opacity:.6}.integrastock-landing .visual{max-width:520px;width:100%;margin:auto}.integrastock-landing .scene{height:300px}.integrastock-landing .strip-inner{padding:22px;flex-wrap:wrap;font-size:11px;gap:16px}.integrastock-landing .strip-inner span:first-child{width:100%}.integrastock-landing section.content{padding:60px 23px}.integrastock-landing .section-top{display:block;margin-bottom:25px}.integrastock-landing h2{font-size:31px}.integrastock-landing .features{grid-template-columns:1fr 1fr}.integrastock-landing .feature,.integrastock-landing .feature:first-child{padding:25px 14px}.integrastock-landing .feature:nth-child(2){border-right:0}.integrastock-landing .feature:nth-child(-n+2){border-bottom:1px solid #dce6e9}.integrastock-landing .flow-inner{grid-template-columns:1fr;padding:55px 23px;gap:28px}.integrastock-landing .bottom{margin:45px 20px;padding:32px 25px;display:block}.integrastock-landing .bottom .btn{margin-top:25px}.integrastock-landing footer{padding:25px 23px;gap:25px;flex-wrap:wrap}.integrastock-landing .hero-foot{gap:12px;font-size:10px}.integrastock-landing .actions .btn{padding:15px 18px}.integrastock-landing .float{padding:13px}.integrastock-landing .float.one{right:0}.integrastock-landing .float.two{left:0}.integrastock-landing .panel{padding:18px}}\n\n.integrastock-landing{line-height:normal;overflow-x:clip}.integrastock-landing h1,.integrastock-landing h2,.integrastock-landing h3{font-weight:700}.integrastock-landing h3{margin:1em 0}.integrastock-landing p{margin:1em 0}.integrastock-landing section[id]{scroll-margin-top:25px}.integrastock-landing .intro{margin:1em 0}.integrastock-landing .panel-note{margin:0}.integrastock-landing .bottom p{margin:0}.integrastock-landing .btn{height:auto;white-space:normal}.integrastock-landing .menu{color:var(--navy)}@media(max-width:400px){.integrastock-landing .actions{flex-direction:column;align-items:stretch}.integrastock-landing h1{font-size:40px}.integrastock-landing .hero-foot{flex-wrap:wrap}}";

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  return (
    <div className="integrastock-landing" lang="es">
      <style>{landingStyles}</style>
      <header>
        <a className="brand" href="#" aria-label="IntegraStock inicio">
          <span className="mark">▱</span>
          <span>
            Integra<em>Stock</em>
            <small>ERP · GESTIÓN CONECTADA</small>
          </span>
        </a>
        <nav
          id="landing-nav"
          className={menuOpen ? "open" : undefined}
          onClick={() => setMenuOpen(false)}
        >
          <a href="#soluciones">Soluciones</a>
          <a href="#flujo">Cómo funciona</a>
          <a href="#comenzar">Bodega ERP</a>
          <a className="btn dark" href="/auth">
            Ingresar al sistema <span>↗</span>
          </a>
        </nav>
        <button
          type="button"
          className="menu"
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-controls="landing-nav"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? "×" : "☰"}
        </button>
      </header>
      <main>
        <section className="hero">
          <div className="hero-inner">
            <div>
              <div className="eyebrow">Control que conecta tu empresa</div>
              <h1>
                Tu bodega en orden.
                <br />
                Tu negocio
                <br />
                <span>en movimiento.</span>
              </h1>
              <p className="intro">
                Conecta tus compras, inventario y recepciones en un solo lugar. Más claridad para
                decidir. Más control para avanzar.
              </p>
              <div className="actions">
                <a className="btn" href="/auth">
                  Ingresar a IntegraStock <span>↗</span>
                </a>
                <a className="btn outline" href="#soluciones">
                  Explorar soluciones
                </a>
              </div>
              <div className="hero-foot">
                <span>
                  <b>✓</b> Trazabilidad
                </span>
                <span>
                  <b>✓</b> Control por perfiles
                </span>
                <span>
                  <b>✓</b> Gestión centralizada
                </span>
              </div>
            </div>
            <div className="visual">
              <svg
                className="scene"
                viewBox="0 0 560 400"
                role="img"
                aria-label="Ilustración de una bodega con estanterías y productos conectados"
              >
                <defs>
                  <linearGradient id="floor" x2="1" y2="1">
                    <stop stopColor="#22556a" />
                    <stop offset="1" stopColor="#102c3f" />
                  </linearGradient>
                  <linearGradient id="box" x2="1" y2="1">
                    <stop stopColor="#67c5c2" />
                    <stop offset="1" stopColor="#287b89" />
                  </linearGradient>
                </defs>
                <path d="M25 280 275 145 550 282 303 416Z" fill="url(#floor)" />
                <g fill="none" stroke="#3c6574" opacity=".45">
                  <path d="m60 300 250-135m-195 160 250-135m-195 160 250-135m-195 160 250-135M92 244l270 136M150 214l270 136M209 183l270 136" />
                </g>
                <path d="M78 275V105L258 16v175Z" fill="#143d50" stroke="#376375" />
                <path d="M258 16 475 123v171L258 191Z" fill="#0c2e42" stroke="#376375" />
                <g stroke="#57959e" strokeWidth="5" fill="none">
                  <path d="M100 111v151m68-185v150m68-185v150M100 160l136-69M100 218l136-69M290 59v145m74-110v146m74-110v145M290 113l148 71M290 169l148 71" />
                </g>
                <g fill="url(#box)" stroke="#7ed1ca" strokeWidth="1">
                  <path d="m110 137 0-26 43-22v26Zm68-34V77l43-22v26Zm-68 93v-27l43-22v27Zm68-34v-27l43-22v27Z" />
                  <path d="m303 105 0-29 47 23v29Zm74 36v-29l47 23v29Zm-74 22v-29l47 23v29Zm74 36v-29l47 23v29Z" />
                </g>
                <g>
                  <path d="m219 271 65-34 66 34-65 35Z" fill="#a0e6d7" />
                  <path d="m219 271 66 35v67l-66-34Z" fill="#258d94" />
                  <path d="m285 306 65-35v67l-65 35Z" fill="#146070" />
                  <path d="m246 256 67 34 14-7-67-34Z" fill="#e0fff4" />
                  <path d="m285 306 28-16v25l-28 16Z" fill="#98dbcf" />
                </g>
                <g fill="none" stroke="#20c5b4" strokeDasharray="5 5" opacity=".7">
                  <path d="M150 265v45l90 45m110-10 109-58v-72" />
                </g>
                <circle cx="150" cy="265" r="5" fill="#4be2ca" />
                <circle cx="459" cy="215" r="5" fill="#4be2ca" />
              </svg>
              <div className="float one">
                <span className="dot">●</span> Compras bajo control
                <small>De la aprobación a la recepción</small>
                <strong>Todo conectado ↗</strong>
              </div>
              <div className="float two">
                <span className="dot">✓</span> Visibilidad de tu inventario
                <small>Entradas · Salidas · Stock</small>
                <strong>Decisiones con información</strong>
              </div>
            </div>
          </div>
        </section>
        <div className="strip">
          <div className="strip-inner">
            <span>DISEÑADO PARA TU OPERACIÓN</span>
            <strong>Constructoras</strong>
            <strong>Contratistas</strong>
            <strong>Bodegas y adquisiciones</strong>
            <span>Un solo flujo. Un mismo equipo.</span>
          </div>
        </div>
        <section id="soluciones" className="content">
          <div className="section-top">
            <div>
              <div className="kicker">Menos planillas. Más visibilidad.</div>
              <h2>
                Cada movimiento cuenta.
                <br />
                Ten el control de todos.
              </h2>
            </div>
            <p>
              Desde la solicitud de compra hasta la entrada a bodega, mantén la información
              organizada y a tu equipo conectado.
            </p>
          </div>
          <div className="features">
            <article className="feature">
              <div className="icon">▦</div>
              <span className="num">01 / INVENTARIO</span>
              <h3>Conoce tu stock</h3>
              <p>
                Consulta existencias, movimientos y productos bajo el mínimo para planificar tus
                compras.
              </p>
            </article>
            <article className="feature">
              <div className="icon">▤</div>
              <span className="num">02 / COMPRAS</span>
              <h3>Compra con control</h3>
              <p>
                Organiza órdenes de compra y su aprobación por gerencia, con el respaldo de cada
                registro.
              </p>
            </article>
            <article className="feature">
              <div className="icon">⇄</div>
              <span className="num">03 / RECEPCIÓN</span>
              <h3>Cierra el recorrido</h3>
              <p>
                Registra entregas parciales o completas y da seguimiento a los productos pendientes.
              </p>
            </article>
            <article className="feature">
              <div className="icon">▥</div>
              <span className="num">04 / INFORMACIÓN</span>
              <h3>Decide con claridad</h3>
              <p>
                Revisa información e informes de bodega para entender qué entra, qué sale y qué
                necesitas.
              </p>
            </article>
          </div>
        </section>
        <section id="flujo" className="flow">
          <div className="flow-inner">
            <div>
              <div className="kicker">Así se conecta tu operación</div>
              <h2>
                De una orden de compra
                <br />a una bodega actualizada.
              </h2>
              <p>
                Cada etapa tiene su responsable. Explora el recorrido de una compra y cómo avanza
                hasta su recepción.
              </p>
              <div className="tabs" role="group" aria-label="Etapas de compra">
                <button type="button" aria-pressed={stage === 0} onClick={() => setStage(0)}>
                  01. Crear
                </button>
                <button type="button" aria-pressed={stage === 1} onClick={() => setStage(1)}>
                  02. Aprobar
                </button>
                <button type="button" aria-pressed={stage === 2} onClick={() => setStage(2)}>
                  03. Recibir
                </button>
              </div>
            </div>
            <div className="panel" aria-live="polite">
              <div className="panel-top">
                <strong>Órdenes de compra</strong>
                <span className="badge">EJEMPLO ILUSTRATIVO</span>
              </div>
              <div className="order">
                <span>
                  <strong>OC-001</strong>
                  <br />
                  <small>Materiales para tu operación</small>
                </span>
                <span className="pill">{STAGES[stage].status}</span>
              </div>
              <div className="steps">
                {["Creación", "Aprobación", "Recepción"].map((label, i) => (
                  <div key={label} className={`step ${i <= stage ? "done" : ""}`}>
                    <b>{i <= stage ? "✓" : i + 1}</b>
                    {label}
                  </div>
                ))}
              </div>
              <p className="panel-note">{STAGES[stage].note}</p>
            </div>
          </div>
        </section>
        <section className="bottom" id="comenzar">
          <div>
            <div className="eyebrow" style={{ marginBottom: 16 }}>
              IntegraStock · Bodega ERP
            </div>
            <h2>Una operación más clara empieza aquí.</h2>
            <p>Accede a tu espacio de trabajo y conecta cada movimiento.</p>
          </div>
          <a className="btn" href="/auth">
            Ingresar al sistema <span>↗</span>
          </a>
        </section>
      </main>
      <footer>
        <a className="brand" href="#">
          Integra<em>Stock</em>
        </a>
        <span>ERP · Inventario, compras y trazabilidad</span>
        <span>Gestión que mueve tu empresa.</span>
      </footer>
    </div>
  );
}

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, FormField, Paragraph, PrimaryActionButton, Select, SelectOption, StatusBadge, SubtleButton, Textbox, Heading3 } from "@utrecht/component-library-react";
import { attribuutGeldt, bepaalBewaren, duurInWoorden, isOndersteunend, ondersteunendeKlassen, rolWaarden, voorstelPersoonsgegevens, type Adapter, type Objecttype, type WieBenIk, type ZaakClassificatie } from "@digitaalgemeengoed/oa-contract";
import { anonimiseren, classificeren, type ClassificatieAntwoord, type Klasse, type Klassetak, type Klassevoorstel, type Stand, type Verbinding } from "@digitaalgemeengoed/oa-kern";

/** "vernietigen na 10 jaar" of "blijvend bewaren". */
export function termijnTekst(r: Klasse): string {
  if (r.waardering === "blijvend-bewaren") return "blijvend bewaren";
  if (r.bewaartermijn) return `vernietigen na ${duurInWoorden(r.bewaartermijn)}`;
  return `vernietigen: ${r.bewaartermijnTekst ?? "zie de toelichting"}`;
}

/** "Ondersteunend · O3 Tussenversie", of "12.2 Verleend" voor een klasse uit de selectielijst. */
export function klasseKop(r: Klasse): string {
  if (!isOndersteunend(r.id)) return `${r.id} ${r.naam}`;
  return r.procestype === 0 && r.omschrijving && r.omschrijving !== "zonder archiefwaarde" ? `Ondersteunend · ${r.omschrijving} ${r.naam}` : "Ondersteunend, zonder archiefwaarde";
}

const PII_NAAM: Record<string, [string, string]> = {
  naam: ["naam", "namen"], adres: ["adres", "adressen"], bsn: ["BSN", "BSN's"], iban: ["IBAN", "IBAN's"], telefoon: ["telefoonnummer", "telefoonnummers"],
  "e-mail": ["e-mailadres", "e-mailadressen"], kenteken: ["kenteken", "kentekens"], geboortedatum: ["geboortedatum", "geboortedata"],
};
/** "3 namen, 1 BSN" (zaaknummers tellen niet: dat zijn geen persoonsgegevens). */
function gevondenTekst(soorten: Record<string, number>): string {
  return Object.entries(soorten)
    .filter(([s]) => s !== "zaaknummer")
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${n} ${(PII_NAAM[s] ?? [s, s])[n === 1 ? 0 : 1]}`)
    .join(", ");
}

function platteTekst(html: string): string {
  try {
    return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
  } catch {
    return html.replace(/<[^>]+>/g, " ");
  }
}

interface Props {
  adapter: Adapter;
  verbinding: Verbinding;
  stand: Stand;
  setStand: (s: Stand) => void;
  type: Objecttype | null;
  wie: WieBenIk;
  klassen: ClassificatieAntwoord | null;
  uit: boolean;
  melding: (m: { soort: "ok" | "info" | "error" | "warning"; tekst: string }) => void;
  fout: (e: unknown) => void;
}

/**
 * Classificeren: een klasse uit de selectielijst kiezen (met voorstellen van
 * de assistent), eigen attributen invullen, en zien wat dat betekent voor
 * het bewaren.
 */
/**
 * Kiezen in stappen, zoals de selectielijst is ingedeeld: eerst het
 * procestype, dan het resultaat; heeft dat uitwerkingen, dan daarna de
 * uitwerking (of het resultaat in het algemeen).
 */
function Stappen({ takken, pad, setPad, regel }: {
  takken: Klassetak[];
  pad: { procestype: number | null; groep: string | null };
  setPad: (p: { procestype: number | null; groep: string | null }) => void;
  regel: (r: Klasse, knop?: string) => ReactNode;
}) {
  const tak = takken.find((t) => t.procestype.nummer === pad.procestype);
  const groep = tak?.groepen.find((g) => g.id === pad.groep);
  return (
    <div className="oa-stappen">
      <nav className="oa-kruimel" aria-label="Waar je bent in de selectielijst">
        <button type="button" onClick={() => setPad({ procestype: null, groep: null })} aria-current={!tak ? "step" : undefined}>Alle procestypen</button>
        {tak && (
          <>
            <span aria-hidden="true">›</span>
            <button type="button" onClick={() => setPad({ procestype: tak.procestype.nummer, groep: null })} aria-current={!groep ? "step" : undefined}>
              {tak.procestype.nummer}. {tak.procestype.naam}
            </button>
          </>
        )}
        {groep && (
          <>
            <span aria-hidden="true">›</span>
            <span aria-current="step">{groep.id} {groep.naam}</span>
          </>
        )}
      </nav>
      {!tak ? (
        <ul className="oa-klassen">
          {takken.map((t) => (
            <li key={t.procestype.nummer} className="oa-stap">
              <button type="button" onClick={() => setPad({ procestype: t.procestype.nummer, groep: null })}>
                <span className="oa-klasse-kop"><b>{t.procestype.nummer}.</b> {t.procestype.naam}</span>
                <span className="oa-klein">{t.aantal} {t.aantal === 1 ? "klasse" : "klassen"}{t.procestype.procesobject ? ` · ${t.procestype.procesobject}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : !groep ? (
        <>
          {tak.procestype.omschrijving && <Paragraph small>{tak.procestype.omschrijving}</Paragraph>}
          <ul className="oa-klassen">
            {tak.groepen.map((g) =>
              g.uitwerkingen.length === 0 && g.zelf ? (
                regel(g.zelf)
              ) : (
                <li key={g.id} className="oa-stap">
                  <button type="button" onClick={() => setPad({ procestype: tak.procestype.nummer, groep: g.id })}>
                    <span className="oa-klasse-kop"><b>{g.id}</b> {g.naam}{g.omschrijving ? <> · {g.omschrijving}</> : null}</span>
                    <span className="oa-klein">{g.uitwerkingen.length} {g.uitwerkingen.length === 1 ? "uitwerking" : "uitwerkingen"}{g.zelf ? " en het resultaat in het algemeen" : ""}</span>
                  </button>
                </li>
              ),
            )}
          </ul>
        </>
      ) : (
        <ul className="oa-klassen">
          {groep.zelf && regel(groep.zelf, "In het algemeen: als geen uitwerking hieronder past")}
          {groep.uitwerkingen.map((r) => regel(r))}
        </ul>
      )}
    </div>
  );
}

export function Classificeren({ adapter, verbinding, stand, setStand, type, wie, klassen, uit, melding, fout }: Props) {
  const object = stand.object!;
  const huidig = object.classificatie ?? null;
  const [keuze, setKeuze] = useState<string>(huidig?.resultaat ?? "");
  const [attributen, setAttributen] = useState<Record<string, string | boolean>>(huidig?.attributen ?? {});
  const [einddatum, setEinddatum] = useState(huidig?.einddatumProcesobject ?? "");
  const [vraag, setVraag] = useState("");
  const [voorstellen, setVoorstellen] = useState<Klassevoorstel[] | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fouten, setFouten] = useState<Record<string, string>>({});
  // Ondersteunend: de medewerker bevestigt eerst dat geen van de toetsvragen geldt.
  const [bevestigd, setBevestigd] = useState(!!huidig?.toetsvragenBevestigd);
  // Kiezen in stappen: procestype, dan het generieke resultaat (met uitwerkingen). Begin bij de huidige klasse.
  const [pad, setPad] = useState<{ procestype: number | null; groep: string | null }>(() => {
    const r = klassen?.selectielijst?.resultaten.find((x) => x.id === huidig?.resultaat);
    return r ? { procestype: r.procestype, groep: r.generiek ?? (klassen!.selectielijst!.resultaten.some((x) => x.generiek === r.id) ? r.id : null) } : { procestype: null, groep: null };
  });

  const lijst = klassen?.selectielijst;
  const model = klassen?.model;
  const alleenLezen = !!object.vergrendeld && !wie.rollen.includes("vrijgever");

  // De assistent leest het stuk en stelt drie klassen voor.
  useEffect(() => {
    if (!lijst) return;
    let weg = false;
    adapter
      .leverInhoud()
      .then((inhoud) => {
        if (weg) return;
        const titel = type ? (rolWaarden(type.schema, object.metadata).titel ?? "") : "";
        setVoorstellen(classificeren.suggesties(inhoud.formaat === "html" ? platteTekst(inhoud.data) : inhoud.data, titel, lijst.resultaten, lijst.procestypen));
      })
      .catch(() => setVoorstellen([]));
    return () => {
      weg = true;
    };
  }, [adapter, lijst, type, object.metadata]);

  // Het standaardattribuut persoonsgegevens: de assistent zoekt ze en stelt een keuze voor.
  const metPii = !!model?.config.attributen.some((a) => a.standaard === "persoonsgegevens" && a.koppeling && Object.keys(a.koppeling).length);
  const [pii, setPii] = useState<Record<string, number> | "bezig" | "fout" | null>(null);
  useEffect(() => {
    if (!metPii || alleenLezen) return;
    let weg = false;
    setPii("bezig");
    anonimiseren
      .vind(adapter, verbinding)
      .then((g) => {
        if (weg) return;
        const tel: Record<string, number> = {};
        for (const t of g.treffers) tel[t.soort] = (tel[t.soort] ?? 0) + 1;
        setPii(tel);
      })
      .catch(() => !weg && setPii("fout"));
    return () => {
      weg = true;
    };
  }, [adapter, verbinding, metPii, alleenLezen, object.identificatie]);

  // Hoe de andere stukken in dezelfde zaak (of hetzelfde dossier) zijn geclassificeerd.
  const [zaak, setZaak] = useState<ZaakClassificatie | null>(null);
  useEffect(() => {
    if (!lijst) return;
    let weg = false;
    verbinding
      .zaakclassificatie(object.identificatie)
      .then((z) => !weg && setZaak(z.rol ? z : null))
      .catch(() => !weg && setZaak(null));
    return () => {
      weg = true;
    };
  }, [verbinding, lijst, object.identificatie, object.metadata]);

  const procestype = useMemo(() => new Map((lijst?.procestypen ?? []).map((p) => [p.nummer, p])), [lijst]);
  // Ondersteunend: geen klasse uit de selectielijst, maar categorieën die de gemeente zelf vastlegt.
  const steun = model?.config.ondersteunend ?? null;
  const steunKlassen = useMemo<Klasse[]>(() => ondersteunendeKlassen(model?.config.ondersteunend), [model]);
  const toetsvragen = steun?.toetsvragen ?? [];
  const klasseVan = (id: string): Klasse | undefined => (isOndersteunend(id) ? steunKlassen.find((k) => k.id === id) : lijst?.resultaten.find((r) => r.id === id));
  const gekozen = klasseVan(keuze);
  const gevonden = useMemo(() => (lijst ? classificeren.zoek(lijst.resultaten, lijst.procestypen, vraag) : []), [lijst, vraag]);
  const takken = useMemo(() => (lijst ? classificeren.boom(lijst.resultaten, lijst.procestypen) : []), [lijst]);

  if (!klassen) return <Paragraph small>Het classificatiemodel wordt geladen…</Paragraph>;
  if (!model || !lijst) {
    return (
      <Alert type="info">
        <Paragraph>Deze gemeente heeft nog geen classificatiemodel. Een beheerder stelt het in het beheerportaal in (Classificatie).</Paragraph>
      </Alert>
    );
  }

  // Wat de keuze betekent: de resultaten van het platform hebben de afwijkingen van de gemeente al verwerkt.
  const bewaren = gekozen
    ? bepaalBewaren({ ...model.config, afwijkingen: [] }, { ...lijst, bron: "", resultaten: lijst.resultaten }, { resultaat: gekozen.id, ...(einddatum ? { einddatumProcesobject: einddatum } : {}) }, object.statusdata ?? {})
    : null;
  const gewijzigd =
    keuze !== (huidig?.resultaat ?? "") ||
    JSON.stringify(attributen) !== JSON.stringify(huidig?.attributen ?? {}) ||
    einddatum !== (huidig?.einddatumProcesobject ?? "") ||
    (isOndersteunend(keuze) && toetsvragen.length > 0 && bevestigd !== !!huidig?.toetsvragenBevestigd);
  const moetBevestigen = isOndersteunend(keuze) && toetsvragen.length > 0 && !bevestigd;

  const kies = (id: string) => {
    setKeuze(id);
    setFouten({});
    // Na kiezen uit de zoekresultaten: de stappen tonen waar de klasse staat.
    const r = lijst?.resultaten.find((x) => x.id === id);
    if (r && vraag) {
      setPad({ procestype: r.procestype, groep: r.generiek ?? (lijst!.resultaten.some((x) => x.generiek === r.id) ? r.id : null) });
      setVraag("");
    }
  };

  const legVast = async () => {
    setBezig(true);
    setFouten({});
    try {
      const s = await classificeren.legVast(verbinding, stand, {
        resultaat: keuze,
        ...(Object.keys(attributen).length
          ? { attributen: Object.fromEntries(Object.entries(attributen).filter(([k, w]) => w !== "" && model.config.attributen.some((a) => a.sleutel === k && attribuutGeldt(a, gekozen?.waardering)))) }
          : {}),
        ...(einddatum ? { einddatumProcesobject: einddatum } : {}),
        ...(isOndersteunend(keuze) && toetsvragen.length ? { toetsvragenBevestigd: bevestigd } : {}),
      });
      setStand(s);
      melding({ soort: "ok", tekst: `De classificatie is vastgelegd: ${gekozen ? klasseKop(gekozen) : keuze}. ${s.object!.bewaren?.uitleg ?? ""}` });
    } catch (e) {
      const d = (e as { details?: { veld: string; melding: string }[] }).details;
      if (Array.isArray(d)) setFouten(Object.fromEntries(d.map((x) => [x.veld, x.melding])));
      fout(e);
    } finally {
      setBezig(false);
    }
  };

  const regel = (r: Klasse, knop?: string) => (
    <li key={r.id} className={`oa-klasse${r.id === keuze ? " gekozen" : ""}`}>
      <button type="button" onClick={() => kies(r.id)} disabled={alleenLezen} aria-pressed={r.id === keuze}>
        <span className="oa-klasse-kop">
          <b>{r.id}</b> {r.naam}
          {r.omschrijving && <> · {r.omschrijving}</>}
        </span>
        <span className="oa-klein">
          {isOndersteunend(r.id) ? "geen archiefwaarde" : procestype.get(r.procestype)?.naam} · {termijnTekst(r)}
          {r.afwijking && " (eigen termijn)"}
        </span>
        {knop && <span className="oa-klein oa-waarom">{knop}</span>}
      </button>
    </li>
  );

  return (
    <section className="oa-sectie" aria-label="Classificeren">
      {alleenLezen && (
        <Alert type="info">
          <Paragraph>Dit stuk is {object.vergrendeld!.status} en vergrendeld. Alleen een vrijgever kan de classificatie nog wijzigen.</Paragraph>
        </Alert>
      )}
      {huidig && (
        <div className="oa-kader oa-kader-rustig">
          <Paragraph small>
            Nu: {isOndersteunend(huidig.resultaat) ? <b>{klasseVan(huidig.resultaat) ? klasseKop(klasseVan(huidig.resultaat)!) : "Ondersteunend"}</b> : <><b>{huidig.resultaat}</b> {klasseVan(huidig.resultaat)?.naam}</>}
            {object.bewaren && <> · {object.bewaren.uitleg}</>}
          </Paragraph>
        </div>
      )}

      {!alleenLezen && (
        <>
          {zaak && (
            <div className="oa-kader oa-zaak">
              <Heading3>Hoort bij {zaak.rol === "zaak" ? "zaak" : "dossier"} {zaak.waarde}</Heading3>
              {zaak.klassen.length === 0 ? (
                <Paragraph small>Nog geen ander stuk in {zaak.rol === "zaak" ? "deze zaak" : "dit dossier"} is geclassificeerd. Wat je hier kiest, wordt het voorstel voor de volgende stukken.</Paragraph>
              ) : (
                <>
                  <Paragraph small>
                    Een stuk in een {zaak.rol} krijgt in de regel dezelfde klasse als de rest. Neem die over, tenzij dit stuk echt anders is.
                    {zaak.klassen.length > 1 && " Niet alle stukken hebben dezelfde klasse; de meest gebruikte staat bovenaan."}
                  </Paragraph>
                  <ul className="oa-klassen">
                    {zaak.klassen.map((z) => {
                      const k = klasseVan(z.resultaat);
                      if (!k) return null;
                      return (
                        <li key={z.resultaat} className={`oa-klasse${z.resultaat === keuze ? " gekozen" : ""}`}>
                          <button
                            type="button"
                            aria-pressed={z.resultaat === keuze}
                            onClick={() => {
                              kies(z.resultaat);
                              if (z.einddatumProcesobject && !einddatum) setEinddatum(z.einddatumProcesobject);
                            }}
                          >
                            <span className="oa-klasse-kop">
                              <b>{k.id}</b> {k.naam}
                              {k.omschrijving && <> · {k.omschrijving}</>}
                            </span>
                            <span className="oa-klein">
                              {termijnTekst(k)} · {z.aantal} {z.aantal === 1 ? "stuk" : "stukken"} in {zaak.rol === "zaak" ? "deze zaak" : "dit dossier"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}
          <Heading3>Voorstel van de assistent</Heading3>
          {voorstellen === null ? (
            <Paragraph small>De assistent leest het stuk…</Paragraph>
          ) : voorstellen.length === 0 ? (
            <Paragraph small>Geen voorstel: de assistent vond geen woorden die bij een klasse passen. Zoek hieronder.</Paragraph>
          ) : (
            <ul className="oa-klassen">{voorstellen.map((v) => regel(v.resultaat, `Op grond van: ${v.woorden.join(", ")}`))}</ul>
          )}
          <Heading3>Zelf kiezen</Heading3>
          <FormField
            label={<label htmlFor="oa-klasse-zoek">Zoek in de selectielijst</label>}
            description="Op nummer (12.2) of op woorden (vergunning kappen). Of kies hieronder in stappen."
            input={<Textbox id="oa-klasse-zoek" type="search" value={vraag} onChange={(e) => setVraag(e.target.value)} autoComplete="off" />}
          />
          {vraag ? (
            gevonden.length ? (
              <ul className="oa-klassen">{gevonden.map((r) => regel(r, `${r.procestype}. ${procestype.get(r.procestype)?.naam ?? ""}`))}</ul>
            ) : (
              <Paragraph small>Niets gevonden.</Paragraph>
            )
          ) : (
            <Stappen takken={takken} pad={pad} setPad={setPad} regel={regel} />
          )}
          {steun && steunKlassen.length > 0 && (
            <div className="oa-steun">
              <Heading3>Geen onderdeel van een proces?</Heading3>
              <Paragraph small>{steun.omschrijving}</Paragraph>
              {toetsvragen.length > 0 && (
                <div className="oa-kader oa-toets">
                  <Paragraph small>
                    <b>Eerst nagaan.</b> Is het antwoord op een van deze vragen ja, dan is het stuk niet ondersteunend: kies dan hierboven een klasse uit de selectielijst.
                  </Paragraph>
                  <ol>
                    {toetsvragen.map((v, i) => <li key={i}>{v}</li>)}
                  </ol>
                  {zaak?.rol === "zaak" && (
                    <Paragraph small className="oa-waarschuwing-tekst">Dit stuk hoort bij zaak {zaak.waarde}. Is het bij de afhandeling gebruikt, dan volgt het de klasse van de zaak.</Paragraph>
                  )}
                  <label className="oa-vinkregel">
                    <input
                      type="checkbox"
                      checked={bevestigd}
                      onChange={(e) => {
                        setBevestigd(e.target.checked);
                        if (!e.target.checked && isOndersteunend(keuze)) setKeuze(huidig && !isOndersteunend(huidig.resultaat) ? huidig.resultaat : "");
                      }}
                    />
                    <span>Geen van deze vragen geldt voor dit stuk</span>
                  </label>
                  {fouten.toetsvragenBevestigd && <Paragraph small className="oa-fouttekst">{fouten.toetsvragenBevestigd}</Paragraph>}
                </div>
              )}
              {(bevestigd || toetsvragen.length === 0) && (
                <ul className="oa-klassen" aria-label="Categorieën ondersteunende stukken">
                  {steunKlassen.map((k) => (
                    <li key={k.id} className={`oa-klasse${keuze === k.id ? " gekozen" : ""}`}>
                      <button type="button" onClick={() => kies(k.id)} aria-pressed={keuze === k.id}>
                        <span className="oa-klasse-kop">
                          {k.id === "ondersteunend" ? <><b>Ondersteunend</b>, zonder archiefwaarde</> : <><b>{k.omschrijving}</b> {k.naam}</>}
                        </span>
                        {k.id !== "ondersteunend" && <span className="oa-klein">{k.toelichting}</span>}
                        <span className="oa-klein">vernietigen {duurInWoorden(k.bewaartermijn!)} na het classificeren</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {gekozen && (
        <div className="oa-gekozen">
          <Heading3>{klasseKop(gekozen)}</Heading3>
          {isOndersteunend(gekozen.id) ? (
            <>
              {gekozen.id !== "ondersteunend" && <Paragraph small>{gekozen.toelichting}</Paragraph>}
              <Paragraph small>Grondslag: {gekozen.herkomst}</Paragraph>
            </>
          ) : (
            <Paragraph small>
              {procestype.get(gekozen.procestype)?.nummer}. {procestype.get(gekozen.procestype)?.naam}
              {gekozen.omschrijving && <> · {gekozen.omschrijving}</>}
            </Paragraph>
          )}
          <Paragraph small>
            <StatusBadge status={gekozen.waardering === "blijvend-bewaren" ? "safe" : "neutral"}>{termijnTekst(gekozen)}</StatusBadge>
            {gekozen.afwijking && <span className="oa-klein"> · afwijking van de selectielijst: {gekozen.afwijking.reden}</span>}
          </Paragraph>
          {!isOndersteunend(gekozen.id) && (gekozen.toelichting || gekozen.procestermijnTekst) && (
            <details className="oa-klein">
              <summary>Toelichting uit de selectielijst</summary>
              {gekozen.toelichting && <p>{gekozen.toelichting}</p>}
              {gekozen.procestermijnTekst && <p>Procestermijn: {gekozen.procestermijnTekst}</p>}
              {gekozen.herkomst && <p>Herkomst: {gekozen.herkomst}</p>}
            </details>
          )}
          {gekozen.waardering === "vernietigen" && gekozen.procestermijn !== "nihil" && (
            <FormField
              label={<label htmlFor="oa-einddatum">{gekozen.procestermijn === "vervaldatum" ? "Vervaldatum" : "Einddatum van het procesobject"}</label>}
              description={`De bewaartermijn gaat pas in als ${procestype.get(gekozen.procestype)?.procesobject?.toLowerCase() || "het procesobject"} vervalt. Leeg laten als dat nog niet bekend is.`}
              input={<Textbox id="oa-einddatum" type="date" value={einddatum} disabled={alleenLezen} onChange={(e) => setEinddatum(e.target.value)} />}
            />
          )}
          {model.config.attributen.filter((a) => attribuutGeldt(a, gekozen.waardering)).map((a) => {
            const voorstel = a.standaard === "persoonsgegevens" && pii && typeof pii === "object" ? voorstelPersoonsgegevens(a, Object.keys(pii)) : null;
            return (
            <Fragment key={a.sleutel}>
            <FormField
              label={<label htmlFor={`oa-attr-${a.sleutel}`}>{a.label}{a.verplicht ? " (verplicht)" : ""}</label>}
              description={a.beschrijving}
              invalid={!!fouten[a.sleutel]}
              errorMessage={fouten[a.sleutel]}
              input={
                a.type === "keuze" ? (
                  <Select id={`oa-attr-${a.sleutel}`} value={String(attributen[a.sleutel] ?? "")} disabled={alleenLezen} onChange={(e) => setAttributen((x) => ({ ...x, [a.sleutel]: e.target.value }))}>
                    <SelectOption value="">Kies…</SelectOption>
                    {(a.opties ?? []).map((o) => (
                      <SelectOption key={o} value={o}>
                        {o}
                      </SelectOption>
                    ))}
                  </Select>
                ) : a.type === "ja-nee" ? (
                  <Select
                    id={`oa-attr-${a.sleutel}`}
                    value={attributen[a.sleutel] === true ? "ja" : attributen[a.sleutel] === false ? "nee" : ""}
                    disabled={alleenLezen}
                    onChange={(e) => setAttributen((x) => ({ ...x, [a.sleutel]: e.target.value === "" ? "" : e.target.value === "ja" }))}
                  >
                    <SelectOption value="">Kies…</SelectOption>
                    <SelectOption value="ja">ja</SelectOption>
                    <SelectOption value="nee">nee</SelectOption>
                  </Select>
                ) : (
                  <Textbox id={`oa-attr-${a.sleutel}`} value={String(attributen[a.sleutel] ?? "")} maxLength={500} disabled={alleenLezen} onChange={(e) => setAttributen((x) => ({ ...x, [a.sleutel]: e.target.value }))} />
                )
              }
            />
            {a.standaard === "persoonsgegevens" && !alleenLezen && pii !== null && (
              <div className="oa-pii-voorstel" aria-live="polite">
                {pii === "bezig" ? (
                  <Paragraph small>De assistent zoekt persoonsgegevens in het stuk…</Paragraph>
                ) : pii === "fout" ? (
                  <Paragraph small>De assistent kon het stuk niet doorzoeken op persoonsgegevens. Kies zelf.</Paragraph>
                ) : voorstel ? (
                  <>
                    <Paragraph small>
                      Voorstel: <b>{voorstel.waarde}</b>. {voorstel.code === "geen" ? "De assistent vond geen persoonsgegevens." : `Gevonden: ${gevondenTekst(pii)}.`} Bijzondere of strafrechtelijke gegevens herkent de assistent niet; die kies je zelf.
                    </Paragraph>
                    {attributen[a.sleutel] !== voorstel.waarde && (
                      <SubtleButton onClick={() => setAttributen((x) => ({ ...x, [a.sleutel]: voorstel.waarde }))}>Overnemen</SubtleButton>
                    )}
                  </>
                ) : null}
              </div>
            )}
            </Fragment>
            );
          })}
          {bewaren && (
            <Paragraph small className="oa-bewaren">
              {bewaren.uitleg}
            </Paragraph>
          )}
          {!alleenLezen && (
            <div className="oa-acties">
              <PrimaryActionButton onClick={legVast} disabled={uit || bezig || !gewijzigd || moetBevestigen} busy={bezig}>
                Classificatie vastleggen
              </PrimaryActionButton>
              {gewijzigd && huidig && (
                <SubtleButton
                  onClick={() => {
                    setKeuze(huidig.resultaat);
                    setAttributen(huidig.attributen ?? {});
                    setEinddatum(huidig.einddatumProcesobject ?? "");
                    setBevestigd(!!huidig.toetsvragenBevestigd);
                  }}
                >
                  Terug naar de vastgelegde
                </SubtleButton>
              )}
            </div>
          )}
        </div>
      )}
      <Paragraph small>
        De assistent stelt voor op grond van de woorden in het stuk; jij kiest. De bewaartermijn komt uit de {lijst.naam}
        {model.config.afwijkingen?.length ? ", met de afwijkingen van je gemeente" : ""}. {lijst.toelichting}
      </Paragraph>
    </section>
  );
}

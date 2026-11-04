"""Generates the 40 Trade City Pages items (original copy per trade x city). Output: trade_city_items.json"""
import json, urllib.parse
SITE = "https://lead-gen-site-dc4966.webflow.io"
APP = "https://archangel-leadgen.vercel.app"
C = {  # city: (metro, local context, public buyers, private demand, practical note)
 "dallas": ("Dallas-Fort Worth", "Dallas mixes century-old neighborhoods like Oak Cliff and East Dallas with dense Uptown mid-rises and a steady stream of corporate relocations.",
   "the City of Dallas, Dallas ISD, Dallas County and DART", "older homes needing updates, investor-owned rentals and office buildings re-tenanting after hybrid work",
   "Expansive Blackland clay and hot summers drive a lot of foundation, drainage and irrigation work."),
 "fort-worth": ("Dallas-Fort Worth", "Fort Worth is one of the fastest-growing large cities in the country, with new master-planned subdivisions to the north and west and historic districts like Fairmount near downtown.",
   "the City of Fort Worth, Fort Worth ISD, Tarrant County and Trinity Metro", "new-build punch lists, first-year warranty fixes and growing HOA communities",
   "Rapid growth on the edges means a lot of first-time maintenance contracts on brand-new properties."),
 "arlington": ("Dallas-Fort Worth", "Arlington sits between Dallas and Fort Worth and is anchored by the entertainment district and UT Arlington.",
   "the City of Arlington, Arlington ISD and Tarrant County", "student and multifamily housing, event-venue support work and 1970s-1990s single-family homes",
   "Turnover around the university calendar creates predictable make-ready and cleaning peaks."),
 "plano": ("Dallas-Fort Worth", "Plano is home to large corporate campuses along the Dallas North Tollway and Legacy area, with mature suburban neighborhoods.",
   "the City of Plano, Plano ISD and Collin County", "corporate facility services, HOA common areas and well-kept suburban homes",
   "Buyers here tend to expect insurance certificates and documented scopes before awarding work."),
 "frisco": ("Dallas-Fort Worth", "Frisco has grown from a small town to a major suburb in two decades, with new schools, sports venues and retail opening every year.",
   "the City of Frisco, Frisco ISD and Collin and Denton counties", "new construction, landscape installs for young subdivisions and commercial finish-outs",
   "Much of the housing stock is under 20 years old, so work skews to upgrades and seasonal maintenance rather than major repair."),
 "irving": ("Dallas-Fort Worth", "Irving includes Las Colinas, a dense business district, plus a large share of apartments near DFW Airport.",
   "the City of Irving, Irving ISD and Dallas County", "multifamily turns, office and hotel cleaning and airport-adjacent logistics properties",
   "Apartment density makes recurring make-ready and janitorial contracts more common than one-off jobs."),
 "houston": ("Greater Houston", "Houston is the largest city in Texas, spread across a huge area with no traditional zoning, so residential, industrial and commercial properties sit side by side.",
   "the City of Houston, Houston ISD, Harris County and METRO", "storm and water-damage repair, energy-sector facility work and a very large rental market",
   "Heavy rain, humidity and hurricane season make drainage, roofing, mold-safe cleaning and fast response times big selling points."),
 "austin": ("Greater Austin", "Austin's tech-driven growth has pushed development east and north, with a mix of older bungalows, new infill and large suburban builds.",
   "the City of Austin, Austin ISD, Travis County and the University of Texas at Austin", "infill remodels, short-term and long-term rental turnover and tech office services",
   "Water-wise landscaping and permit-aware contractors stand out, since the city has detailed watering and development rules."),
 "san-antonio": ("Greater San Antonio", "San Antonio combines historic neighborhoods near downtown and the River Walk with large military and medical employers.",
   "the City of San Antonio, Bexar County, SAISD, Northside ISD and SAWS", "military and medical-center housing, older-home repair and growing north-side subdivisions",
   "Federal work tied to Joint Base San Antonio shows up on SAM.gov, separate from city and county bids."),
 "el-paso": ("El Paso", "El Paso is a high-desert border city with its own climate and market, far from the other Texas metros.",
   "the City of El Paso, El Paso County, El Paso ISD, Socorro ISD and El Paso Water", "desert-adapted landscaping, military housing near Fort Bliss and steady residential repair",
   "Low rainfall and strong sun favor xeriscape, stucco and roof work; federal Fort Bliss opportunities are posted on SAM.gov."),
}
NAMES = {"dallas":"Dallas","fort-worth":"Fort Worth","arlington":"Arlington","plano":"Plano","frisco":"Frisco","irving":"Irving","houston":"Houston","austin":"Austin","san-antonio":"San Antonio","el-paso":"El Paso"}
T = {  # trade key: (label, filter value, what the work is, how leads arrive, tip)
 "landscaping": ("Landscaping", "landscaping", "mowing contracts, irrigation repair, seasonal installs and grounds maintenance for homes, HOAs and public sites",
   "Public grounds contracts are often bid annually, while homeowner requests come in waves each spring and fall.",
   "Price recurring maintenance per visit and list your irrigation license number if you have one."),
 "residential-repair": ("Residential Repair", "residential_repair", "handyman work, drywall, doors, fencing, minor plumbing and electrical fixes and pre-sale repair lists",
   "Homeowner requests are usually small and urgent, so the first contractor to respond with a clear price often wins.",
   "Respond fast, give a written scope and say plainly what is and isn't included."),
 "cleaning": ("Cleaning & Janitorial", "cleaning", "recurring office janitorial, post-construction cleanup, move-out cleans and school or municipal building service",
   "Public janitorial work is often bid as multi-year contracts with site walks and wage requirements.",
   "Have proof of insurance and a bonding answer ready; many buyers ask before they schedule a walkthrough."),
 "multifamily": ("Multifamily Make-Ready", "multifamily", "unit turns, paint, flooring patches, appliance swaps and punch-list work for apartment communities",
   "Property managers need dependable crews who can turn units in days, and they reward reliability with repeat work.",
   "Quote a standard turn package and show your typical turnaround time."),
 "commercial-construction": ("Commercial Construction", "commercial_construction", "tenant finish-outs, renovations, site work and subcontract packages on public and private projects",
   "Public projects publish plans, pre-bid meetings and deadlines; private work often comes through general contractors' bid invites.",
   "Track pre-bid dates and bonding requirements early, since late questions are often not answered."),
 "government-bids": ("Government Bids", "government_procurement", "city, county, school-district, transit and federal solicitations for services and small construction",
   "Each buyer posts on its own portal, and federal work goes to SAM.gov, so bids are scattered across many sites.",
   "Register as a vendor with the buyers you care about and read every addendum before you submit."),
}
COMBOS = {
 "dallas":["landscaping","residential-repair","cleaning","multifamily","commercial-construction","government-bids"],
 "fort-worth":["landscaping","residential-repair","cleaning","commercial-construction","government-bids"],
 "arlington":["multifamily","cleaning","residential-repair"],
 "plano":["landscaping","cleaning","residential-repair"],
 "frisco":["landscaping","commercial-construction","residential-repair"],
 "irving":["multifamily","cleaning"],
 "houston":["landscaping","residential-repair","cleaning","multifamily","commercial-construction","government-bids"],
 "austin":["landscaping","residential-repair","cleaning","commercial-construction","government-bids"],
 "san-antonio":["landscaping","residential-repair","cleaning","government-bids"],
 "el-paso":["landscaping","residential-repair","government-bids"],
}
# Trade-city specific angle sentences: makes each page distinct beyond the city+trade parts.
ANGLE = {
 ("landscaping","dallas"):"Clay soil that shrinks in August and swells after storms keeps irrigation and drainage fixes in steady demand.",
 ("landscaping","fort-worth"):"New subdivisions on the north and west sides need first installs, sod and HOA entrance maintenance.",
 ("landscaping","plano"):"Corporate campuses and HOAs usually want one reliable vendor on a yearly schedule rather than one-off visits.",
 ("landscaping","frisco"):"Young neighborhoods are often moving from builder-grade yards to finished beds, trees and lighting.",
 ("landscaping","houston"):"Fast growth from heat and rain means frequent mowing cycles and real demand for drainage and French-drain work.",
 ("landscaping","austin"):"Native plants, drip irrigation and compliance with watering schedules are frequent asks.",
 ("landscaping","san-antonio"):"Water-saving landscapes and rebate-friendly designs are popular with homeowners on the north side.",
 ("landscaping","el-paso"):"Rock, desert plants and efficient drip systems are the norm, and lawn removal projects are common.",
 ("residential-repair","dallas"):"Older pier-and-beam homes generate door, trim and drywall repairs as foundations move.",
 ("residential-repair","fort-worth"):"Owners of newer homes often need small fixes after the builder warranty runs out.",
 ("residential-repair","arlington"):"Landlords near the university want quick repairs between tenants.",
 ("residential-repair","plano"):"Homeowners preparing to sell often bring a full inspection repair list.",
 ("residential-repair","frisco"):"Upgrades like built-ins, fixture swaps and fence work are more common than structural repair.",
 ("residential-repair","houston"):"After storms, water-damage repairs, fence replacement and roof patches spike quickly.",
 ("residential-repair","austin"):"Older central bungalows need careful repair work that respects original materials.",
 ("residential-repair","san-antonio"):"Historic-district homes may need repairs that follow local preservation guidance.",
 ("residential-repair","el-paso"):"Stucco cracks, swamp-cooler service and sun-damaged trim are frequent requests.",
 ("cleaning","dallas"):"Office re-tenanting and new apartment openings both create post-construction and recurring cleaning work.",
 ("cleaning","fort-worth"):"New-build final cleans and school-facility contracts are reliable sources of work.",
 ("cleaning","arlington"):"Move-out cleans cluster around the academic calendar and event-season demand.",
 ("cleaning","plano"):"Corporate offices along the tollway look for janitorial vendors who can document quality checks.",
 ("cleaning","irving"):"Hotels, offices and airport-area properties keep recurring janitorial schedules busy.",
 ("cleaning","houston"):"Humidity makes mold-aware cleaning and fast post-flood cleanup important.",
 ("cleaning","austin"):"Rental turnover and new office buildouts both need dependable post-construction cleaning.",
 ("cleaning","san-antonio"):"Medical and military-adjacent facilities often require background checks and set schedules.",
 ("multifamily","dallas"):"Large apartment portfolios want crews that can handle many turns a week to a consistent standard.",
 ("multifamily","arlington"):"Student housing creates a big wave of turns each summer.",
 ("multifamily","irving"):"Dense communities near Las Colinas run recurring turn schedules year-round.",
 ("multifamily","houston"):"Water intrusion and humidity add drywall and flooring repairs to standard turns.",
 ("commercial-construction","dallas"):"Tenant finish-outs and renovations follow office and retail leasing activity.",
 ("commercial-construction","fort-worth"):"Public facilities and private retail keep pace with population growth.",
 ("commercial-construction","frisco"):"New schools, sports venues and retail centers create steady subcontract packages.",
 ("commercial-construction","houston"):"Industrial, medical and public works projects create a wide range of subcontract packages.",
 ("commercial-construction","austin"):"Office, lab and public infrastructure projects tied to growth post regular bid packages.",
 ("government-bids","dallas"):"Local buyers post separately, so tracking several portals at once is the main challenge.",
 ("government-bids","fort-worth"):"City, county and school-district bids are posted on different schedules.",
 ("government-bids","houston"):"Large local agencies plus federal work through SAM.gov make Houston one of the busiest bid markets in Texas.",
 ("government-bids","austin"):"State agencies headquartered in Austin add to city, county and university solicitations.",
 ("government-bids","san-antonio"):"Federal military work joins city, county and utility solicitations.",
 ("government-bids","el-paso"):"Federal work near Fort Bliss sits alongside city, county and school-district bids.",
}
items = []
for city, trades in COMBOS.items():
  metro, ctx, buyers, demand, note = C[city]; cn = NAMES[city]
  for t in trades:
    tl, tf, what, how, tip = T[t]; slug = f"{t}-{city}"
    angle = ANGLE[(t, city)]
    jobs = f"{SITE}/opportunities?" + urllib.parse.urlencode({"trade": tf, "city": cn})
    intro = (f"<p>Looking for {tl.lower()} work in {cn}? {ctx} {angle}</p>"
             f"<p>Crewforthat collects public bids from buyers such as {buyers}, plus verified homeowner requests in DFW, so you can see {tl.lower()} opportunities in one place instead of checking every portal.</p>")
    body = (f"<h2>What {tl.lower()} work looks like in {cn}</h2><p>Typical jobs include {what}. Demand here comes from {demand}. {note}</p>"
            f"<h2>How the work shows up</h2><p>{how} Public bids on Crewforthat are open to any qualified bidder and are not exclusive. We link to the official listing so you always apply at the source.</p>"
            f"<h2>Tip for {cn} contractors</h2><p>{tip}</p>"
            f"<p><small>No job volume, award or income is guaranteed. Listings are checked regularly but always confirm details on the official posting.</small></p>")
    others = [x for x in trades if x != t][:3]
    elsewhere = [c for c, ts in COMBOS.items() if t in ts and c != city][:3]
    rel = "<ul>" + "".join(f'<li><a href="/contractor-jobs/{o}-{city}">{T[o][0]} jobs in {cn}</a></li>' for o in others) \
        + "".join(f'<li><a href="/contractor-jobs/{t}-{c}">{tl} jobs in {NAMES[c]}</a></li>' for c in elsewhere) \
        + '<li><a href="/opportunities">All jobs now</a></li><li><a href="/for-contractors">How Crewforthat works for contractors</a></li></ul>'
    seo_t = f"{tl} Jobs in {cn}, TX | Bids & Leads | Crewforthat"
    meta = f"Find {tl.lower()} bids and leads in {cn}, Texas from {buyers.split(',')[0].replace('the ','')} and more. Free contractor account, official links, no fake leads."[:158]
    items.append({"name": f"{tl} jobs in {cn}", "slug": slug, "headline": f"{tl} jobs and bids in {cn}, Texas", "trade": tl, "city": cn, "metro": metro,
      "intro": intro, "local-detail": body, "related-links": rel, "jobs-link": jobs,
      "signup-link": f"{SITE}/for-contractors?utm_source=seo&utm_medium=trade_city&utm_campaign={slug}",
      "seo-title": seo_t, "meta-description": meta})
json.dump(items, open("trade_city_items.json", "w"), indent=1)
print(len(items), len({i['slug'] for i in items}), max(len(i['seo-title']) for i in items))

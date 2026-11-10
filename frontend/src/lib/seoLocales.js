// Localized SEO landing pages: Spain (es), China (zh), Japan (ja), Korea (ko), UK (en-GB), Canada (en-CA).
export const SITE = "https://roxtaxi.com";

export const CLUSTERS = {
  home: { en: "/", es: "/es", "zh-Hans": "/zh", ja: "/ja", ko: "/ko", "en-GB": "/uk", "en-CA": "/ca" },
  taxi: { en: "/taxi", es: "/es/taxi", "en-GB": "/uk/taxi", "en-CA": "/ca/taxi" },
  tours: { en: "/tours", es: "/es/tours" },
};

export const alternatesFor = (cluster) =>
  [...Object.entries(CLUSTERS[cluster]).map(([hreflang, path]) => ({ hreflang, href: SITE + path })),
    { hreflang: "x-default", href: SITE + CLUSTERS[cluster].en }];

const card = (title, body, to) => ({ title, body, to });

const ES = {
  "": {
    title: "Taxi en Nasáu, Bahamas | Traslados al aeropuerto LPIA, Atlantis y excursiones",
    description: "Taxi en Nasáu (Bahamas) con conductores con licencia 24/7: traslados desde el aeropuerto LPIA desde $35, Atlantis, Paradise Island, Baha Mar, Cable Beach y puerto de cruceros. Excursiones y alquiler de coches. Reserva online en español.",
    keywords: "taxi Nasáu, taxi Nassau Bahamas, traslado aeropuerto Nassau, taxi aeropuerto LPIA, taxi Atlantis Paradise Island, excursiones Nassau, tours Bahamas, alquiler de coche Nassau, puerto de cruceros Nassau taxi, viaje a Bahamas desde España",
    eyebrow: "Nasáu · Bahamas",
    h1: "Tu taxi de confianza en Nasáu, Bahamas",
    intro: "Conductores locales con licencia, tarifas fijas y seguimiento GPS en vivo. Te esperamos en el aeropuerto LPIA, en tu hotel o en el puerto de cruceros, de día o de noche.",
    cta: "Reservar un taxi", cta2: "Ver excursiones",
    cards: [
      card("Traslados al aeropuerto", "Desde el aeropuerto LPIA desde $35 a Cable Beach, Baha Mar, Atlantis y el centro. Seguimos tu vuelo si llega con retraso.", "/taxi"),
      card("Excursiones y tours", "Nado con delfines, Blue Lagoon, Atlantis, playas e historia de Nasáu con guías locales.", "/tours"),
      card("Alquiler de coches", "Coches entregados en el aeropuerto o en tu hotel. Recuerda: en Bahamas se conduce por la izquierda.", "/rentals"),
    ],
    stepsTitle: "Cómo reservar",
    steps: ["Elige origen y destino: el precio aparece al instante.", "Añade pasajeros, maletas o silla infantil.", "Paga online con tarjeta o PayPal y recibe la confirmación por correo."],
    note: "Precios en dólares (USD). El dólar bahameño equivale 1:1 al dólar estadounidense. Las tarjetas europeas funcionan normalmente; tu banco hace la conversión desde euros.",
    faq: [
      { q: "¿Cuánto cuesta un taxi del aeropuerto de Nasáu al hotel?", a: "Los traslados desde el aeropuerto LPIA empiezan en $35 para dos personas. El precio exacto aparece al elegir tu destino al reservar." },
      { q: "¿Habláis español?", a: "La reserva online está disponible en español y puedes escribirnos por WhatsApp a cualquier hora." },
      { q: "¿Puedo pagar con tarjeta?", a: "Sí, puedes pagar online con tarjeta de crédito o débito, o con PayPal." },
    ],
  },
  taxi: {
    title: "Taxi aeropuerto Nassau (LPIA) | Tarifas fijas a Atlantis, Baha Mar y Cable Beach",
    description: "Reserva tu taxi en Nasáu: aeropuerto LPIA, Atlantis, Paradise Island, Baha Mar, Cable Beach, centro y puerto de cruceros. Tarifas fijas, conductores con licencia 24/7, silla infantil disponible.",
    keywords: "taxi aeropuerto Nassau, tarifa taxi Nassau Atlantis, taxi LPIA, taxi Baha Mar, taxi Cable Beach, taxi puerto cruceros Nassau, taxi 24 horas Nassau",
    eyebrow: "Taxi · Nasáu",
    h1: "Taxi en Nasáu con tarifas fijas",
    intro: "Ves el precio antes de reservar. Rutas habituales entre el aeropuerto, los hoteles de Cable Beach y Paradise Island, el centro y el puerto de cruceros, y trayectos con varias paradas.",
    cta: "Ver tarifas y reservar", cta2: "Pedir presupuesto",
    cta2To: "/quote",
    cards: [
      card("Aeropuerto LPIA", "Recogida a la salida con seguimiento de tu vuelo. Desde $35.", "/taxi"),
      card("Puerto de cruceros", "Recogida en Prince George Wharf para playas, Atlantis o excursiones.", "/taxi"),
      card("Varias paradas", "Añade tantas paradas como quieras; cada tramo se cobra con su tarifa.", "/taxi"),
    ],
    stepsTitle: "Reserva en 1 minuto",
    steps: ["Elige origen y destino.", "Indica fecha, hora y número de pasajeros.", "Paga online y recibe tu confirmación con seguimiento en vivo."],
    note: "Primeros dos pasajeros incluidos; cada pasajero adicional tiene un pequeño suplemento. Silla infantil disponible por $2.",
    faq: [
      { q: "¿El precio es fijo?", a: "Sí. Las rutas publicadas tienen tarifa fija, sin taxímetro ni sorpresas." },
      { q: "¿Y si mi vuelo se retrasa?", a: "Seguimos tu vuelo y el conductor se adapta a la hora real de llegada." },
    ],
  },
  tours: {
    title: "Excursiones en Nasáu, Bahamas | Delfines, Blue Lagoon y Atlantis",
    description: "Excursiones en Nasáu con guías locales: nado con delfines, Blue Lagoon Island, Atlantis, Baha Mar, playas y tours para cruceristas. Reserva online en español.",
    keywords: "excursiones Nassau, tours Nassau Bahamas, nadar con delfines Nassau, Blue Lagoon Bahamas, excursión Atlantis, excursiones crucero Nassau",
    eyebrow: "Excursiones · Bahamas",
    h1: "Excursiones en Nasáu para todos",
    intro: "Días de playa, delfines, historia y comida local. Ideales si llegas en crucero y quieres volver a tiempo al barco.",
    cta: "Ver todas las excursiones", ctaTo: "/tours", cta2: "Reservar un taxi", cta2To: "/taxi",
    cards: [
      card("Nado con delfines", "Experiencia estrella en Blue Lagoon Island.", "/tours/blue-lagoon"),
      card("Atlantis", "Visita el resort más famoso de Paradise Island.", "/tours/atlantis"),
      card("Cable Beach", "Un día de playa con traslado incluido.", "/tours/cable-beach-day"),
    ],
    stepsTitle: "Cómo funciona",
    steps: ["Elige la excursión y la fecha.", "Indica cuántas personas vienen.", "Paga online y recibe los detalles de recogida."],
    note: "Precios en dólares (USD). Recogida en hoteles y en el puerto de cruceros.",
    faq: [
      { q: "¿Sirven para pasajeros de crucero?", a: "Sí, los horarios se ajustan a tu escala y te devolvemos al puerto a tiempo." },
    ],
  },
};

const ZH = {
  "": {
    title: "巴哈马拿骚出租车 | 林登·平德林机场 (LPIA) 接送、亚特兰蒂斯与旅游行程",
    description: "巴哈马拿骚持牌出租车 24 小时服务：LPIA 机场接送 $35 起，前往亚特兰蒂斯、天堂岛、Baha Mar、Cable Beach 及邮轮码头。另有一日游与租车，可在线预订。",
    keywords: "拿骚出租车, 巴哈马出租车, 拿骚机场接送, LPIA 机场, 亚特兰蒂斯酒店接送, 天堂岛, 巴哈马旅游, 拿骚一日游, 与海豚共游, 巴哈马邮轮岸上游",
    eyebrow: "拿骚 · 巴哈马",
    h1: "拿骚可靠的出租车与旅游服务",
    intro: "本地持牌司机、固定价格、实时 GPS 追踪。无论在 LPIA 机场、酒店还是邮轮码头，日夜都可接送。",
    cta: "预订出租车", cta2: "查看旅游行程",
    cards: [
      card("机场接送", "LPIA 机场至 Cable Beach、Baha Mar、亚特兰蒂斯及市中心，$35 起。航班延误我们会跟踪。", "/taxi"),
      card("一日游与观光", "与海豚共游、蓝湖岛、亚特兰蒂斯、海滩与拿骚历史游。", "/tours"),
      card("租车服务", "可送车至机场或酒店。请注意：巴哈马靠左行驶。", "/rentals"),
    ],
    stepsTitle: "如何预订",
    steps: ["选择出发地和目的地，即时显示价格。", "添加乘客人数、行李或儿童安全座椅。", "使用银行卡或 PayPal 在线支付，邮件确认。"],
    note: "价格以美元 (USD) 计。巴哈马元与美元 1:1 等值。来自亚洲的旅客通常经美国城市（如迈阿密）转机抵达拿骚。",
    faq: [
      { q: "从拿骚机场到酒店需要多少钱？", a: "LPIA 机场接送两人 $35 起，预订时选择目的地即可看到准确价格。" },
      { q: "可以在线付款吗？", a: "可以，支持信用卡、借记卡和 PayPal 在线支付。" },
    ],
  },
};

const JA = {
  "": {
    title: "バハマ・ナッソーのタクシー | LPIA空港送迎・アトランティス・観光ツアー",
    description: "バハマ・ナッソーの公認タクシー（24時間）。LPIA空港送迎は$35から。アトランティス、パラダイス島、バハマー、ケーブルビーチ、クルーズ港へ。ツアーやレンタカーもオンライン予約可能。",
    keywords: "ナッソー タクシー, バハマ タクシー, ナッソー 空港送迎, LPIA 空港, アトランティス 送迎, パラダイス島, バハマ 観光, ナッソー ツアー, イルカと泳ぐ バハマ, クルーズ 寄港地観光 ナッソー",
    eyebrow: "ナッソー · バハマ",
    h1: "ナッソーで安心のタクシーと観光",
    intro: "地元の公認ドライバー、明朗な定額料金、リアルタイムGPS追跡。LPIA空港、ホテル、クルーズ港へ昼夜問わずお迎えします。",
    cta: "タクシーを予約", cta2: "ツアーを見る",
    cards: [
      card("空港送迎", "LPIA空港からケーブルビーチ、バハマー、アトランティス、ダウンタウンへ$35から。フライト遅延にも対応。", "/taxi"),
      card("ツアー・観光", "イルカと泳ぐ体験、ブルーラグーン島、アトランティス、ビーチやナッソーの歴史散策。", "/tours"),
      card("レンタカー", "空港やホテルへ配車。バハマは左側通行です。", "/rentals"),
    ],
    stepsTitle: "予約方法",
    steps: ["出発地と目的地を選ぶと料金がすぐに表示されます。", "人数、荷物、チャイルドシートを追加。", "カードまたはPayPalでオンライン決済、メールで確認。"],
    note: "料金は米ドル（USD）表示です。バハマ・ドルは米ドルと1:1の等価です。日本からは米国の都市（マイアミなど）経由での到着が一般的です。",
    faq: [
      { q: "ナッソー空港からホテルまでいくらですか？", a: "LPIA空港送迎は2名で$35から。予約時に目的地を選ぶと正確な料金が表示されます。" },
      { q: "オンラインで支払えますか？", a: "はい。クレジットカード、デビットカード、PayPalでお支払いいただけます。" },
    ],
  },
};

const KO = {
  "": {
    title: "바하마 나소 택시 | LPIA 공항 픽업·아틀란티스·투어",
    description: "바하마 나소 공인 택시 24시간 운영: LPIA 공항 픽업 $35부터, 아틀란티스, 파라다이스 아일랜드, 바하 마르, 케이블 비치, 크루즈 항구까지. 투어와 렌터카도 온라인 예약.",
    keywords: "나소 택시, 바하마 택시, 나소 공항 픽업, LPIA 공항, 아틀란티스 리조트 이동, 파라다이스 아일랜드, 바하마 여행, 나소 투어, 돌고래와 수영 바하마, 크루즈 기항지 투어 나소",
    eyebrow: "나소 · 바하마",
    h1: "나소에서 믿을 수 있는 택시와 투어",
    intro: "현지 공인 기사, 고정 요금, 실시간 GPS 추적. LPIA 공항, 호텔, 크루즈 항구 어디서든 밤낮으로 모십니다.",
    cta: "택시 예약하기", cta2: "투어 보기",
    cards: [
      card("공항 픽업", "LPIA 공항에서 케이블 비치, 바하 마르, 아틀란티스, 다운타운까지 $35부터. 항공편 지연도 추적합니다.", "/taxi"),
      card("투어·관광", "돌고래와 수영, 블루 라군 섬, 아틀란티스, 해변과 나소 역사 투어.", "/tours"),
      card("렌터카", "공항이나 호텔로 차량을 배달합니다. 바하마는 좌측 통행입니다.", "/rentals"),
    ],
    stepsTitle: "예약 방법",
    steps: ["출발지와 목적지를 고르면 요금이 바로 표시됩니다.", "인원, 짐, 유아용 카시트를 추가하세요.", "카드 또는 PayPal로 온라인 결제 후 이메일로 확인받으세요."],
    note: "요금은 미국 달러(USD) 기준입니다. 바하마 달러는 미국 달러와 1:1입니다. 한국에서는 보통 미국 도시(마이애미 등)를 경유해 도착합니다.",
    faq: [
      { q: "나소 공항에서 호텔까지 요금은 얼마인가요?", a: "LPIA 공항 픽업은 2인 기준 $35부터이며, 예약 시 목적지를 선택하면 정확한 요금이 표시됩니다." },
      { q: "온라인 결제가 되나요?", a: "네. 신용카드, 체크카드, PayPal로 결제할 수 있습니다." },
    ],
  },
};

const enCards = (word) => [
  card("Airport transfers", "LPIA airport to Cable Beach, Baha Mar, Atlantis and downtown from $35. We track your flight if it lands late.", "/taxi"),
  card("Tours & excursions", "Dolphin swims, Blue Lagoon Island, Atlantis, beaches and Nassau history with local guides.", "/tours"),
  card(`Car hire`, `Cars delivered to the airport or your hotel. Good news for ${word} drivers: the Bahamas drives on the left.`, "/rentals"),
];

const UK = {
  "": {
    title: "Nassau Taxi Bahamas for UK Travellers | LPIA Airport Transfers & Holiday Tours",
    description: "Nassau taxi service for UK holidaymakers: LPIA airport transfers from $35 to Atlantis, Paradise Island, Baha Mar and Cable Beach, plus Bahamas tours and car hire. Licensed 24/7 drivers, fixed fares, book online with a UK card.",
    keywords: "Nassau taxi UK, Bahamas holiday transfers, Nassau airport transfer from London, LPIA taxi, Atlantis transfer, Bahamas holidays UK, Nassau excursions, Bahamas car hire, Nassau cruise excursions",
    eyebrow: "Nassau · Bahamas · for UK guests",
    h1: "Your Nassau taxi, sorted before you fly",
    intro: "Landing on the London Heathrow flight? Your licensed driver meets you at LPIA, with fixed fares, live GPS tracking and help with your luggage.",
    cta: "Book a taxi", cta2: "See excursions",
    cards: enCards("UK"),
    stepsTitle: "How booking works",
    steps: ["Pick your pickup and drop-off and see the fare instantly.", "Add passengers, suitcases or a child seat.", "Pay online with your UK card or PayPal and get your confirmation by email."],
    note: "Prices are in US dollars. The Bahamian dollar is pegged 1:1 to the US dollar. UK debit and credit cards work as normal, and your bank converts from pounds.",
    faq: [
      { q: "How much is a taxi from Nassau airport to my hotel?", a: "LPIA airport transfers start at $35 for two people. You'll see the exact fare when you choose your destination." },
      { q: "Can I pay with a UK card?", a: "Yes, Visa and Mastercard from UK banks work, and so does PayPal." },
    ],
  },
  taxi: {
    title: "Nassau Airport Taxi (LPIA) for UK Travellers | Fixed Fares to Atlantis & Cable Beach",
    description: "Pre-book your Nassau airport taxi from the UK: fixed fares from LPIA to Atlantis, Paradise Island, Baha Mar, Cable Beach and downtown. Licensed drivers, flight tracking, child seats available.",
    keywords: "Nassau airport taxi UK, LPIA transfer, pre-book taxi Nassau, Atlantis airport transfer, Baha Mar transfer, Cable Beach taxi, Bahamas holiday taxi",
    eyebrow: "Taxi · Nassau",
    h1: "Fixed-fare Nassau taxis, pre-booked from the UK",
    intro: "See the fare before you book, with no meter and no haggling on arrival. Popular routes include the airport, Cable Beach and Paradise Island hotels, downtown and the cruise port.",
    cta: "See fares & book", cta2: "Get a quote", cta2To: "/quote",
    cards: [
      card("LPIA arrivals", "Meet-and-greet with flight tracking. From $35.", "/taxi"),
      card("Cruise port", "Pickups at Prince George Wharf for beaches, Atlantis or tours.", "/taxi"),
      card("Multi-stop trips", "Add as many stops as you like, and each leg is priced at its own fare.", "/taxi"),
    ],
    stepsTitle: "Book in a minute",
    steps: ["Choose pickup and drop-off.", "Set date, time and passengers.", "Pay online and get live tracking on the day."],
    note: "First two passengers included, with a small fee per extra guest. Child car seats are $2 each.",
    faq: [
      { q: "Are the fares fixed?", a: "Yes. Published routes have fixed fares, so there are no surprises." },
      { q: "What if my flight is delayed?", a: "We track your flight and your driver adjusts to the real landing time." },
    ],
  },
};

const CA = {
  "": {
    title: "Nassau Taxi Bahamas for Canadian Travellers | LPIA Airport Transfers & Tours",
    description: "Nassau taxi service for Canadians: LPIA airport transfers from $35 USD to Atlantis, Paradise Island, Baha Mar and Cable Beach, plus Bahamas tours and car rentals. Licensed 24/7 drivers, fixed fares, book online with a Canadian card.",
    keywords: "Nassau taxi Canada, Bahamas vacation transfers, Nassau airport transfer from Toronto, LPIA taxi, Atlantis transfer, Bahamas vacation Canada, Nassau excursions, Bahamas car rental, Nassau cruise excursions",
    eyebrow: "Nassau · Bahamas · for Canadian guests",
    h1: "Your Nassau ride, booked before you leave Canada",
    intro: "Flying in from Toronto? Your licensed driver meets you at LPIA, with fixed fares, live GPS tracking and help with your bags.",
    cta: "Book a taxi", cta2: "See excursions",
    cards: enCards("Canadian"),
    stepsTitle: "How booking works",
    steps: ["Pick your pickup and drop-off and see the fare instantly.", "Add passengers, suitcases or a child seat.", "Pay online with your Canadian card or PayPal and get your confirmation by email."],
    note: "Prices are in US dollars. Canadian credit and debit cards work as normal, and your bank converts from Canadian dollars.",
    faq: [
      { q: "How much is a taxi from Nassau airport to my resort?", a: "LPIA airport transfers start at $35 USD for two people. You'll see the exact fare when you choose your destination." },
      { q: "Can I pay with a Canadian card?", a: "Yes, Visa and Mastercard from Canadian banks work, and so does PayPal." },
    ],
  },
  taxi: {
    title: "Nassau Airport Taxi (LPIA) for Canadians | Fixed Fares to Atlantis & Cable Beach",
    description: "Pre-book your Nassau airport taxi from Canada: fixed fares in USD from LPIA to Atlantis, Paradise Island, Baha Mar, Cable Beach and downtown. Licensed drivers, flight tracking, child seats available.",
    keywords: "Nassau airport taxi Canada, LPIA transfer, pre-book taxi Nassau, Atlantis airport transfer, Baha Mar transfer, Cable Beach taxi, Bahamas vacation taxi",
    eyebrow: "Taxi · Nassau",
    h1: "Fixed-fare Nassau taxis, pre-booked from Canada",
    intro: "See the fare in USD before you book. Popular routes include the airport, Cable Beach and Paradise Island resorts, downtown and the cruise port.",
    cta: "See fares & book", cta2: "Get a quote", cta2To: "/quote",
    cards: UK.taxi.cards,
    stepsTitle: "Book in a minute",
    steps: UK.taxi.steps,
    note: UK.taxi.note,
    faq: UK.taxi.faq,
  },
};

export const LOCALES = {
  es: { lang: "es", hreflang: "es", ogLocale: "es_ES", gt: "es", label: "Español", country: "ES", pages: ES },
  zh: { lang: "zh-Hans", hreflang: "zh-Hans", ogLocale: "zh_CN", gt: "zh-CN", label: "中文", country: "CN", pages: ZH },
  ja: { lang: "ja", hreflang: "ja", ogLocale: "ja_JP", gt: "ja", label: "日本語", country: "JP", pages: JA },
  ko: { lang: "ko", hreflang: "ko", ogLocale: "ko_KR", gt: "ko", label: "한국어", country: "KR", pages: KO },
  uk: { lang: "en-GB", hreflang: "en-GB", ogLocale: "en_GB", gt: null, label: "UK", country: "GB", pages: UK },
  ca: { lang: "en-CA", hreflang: "en-CA", ogLocale: "en_CA", gt: null, label: "Canada", country: "CA", pages: CA },
};

export const LOCALE_ROUTES = Object.entries(LOCALES).flatMap(([lk, loc]) =>
  Object.keys(loc.pages).map((pk) => ({ path: `/${lk}${pk ? "/" + pk : ""}`, lk, pk })));

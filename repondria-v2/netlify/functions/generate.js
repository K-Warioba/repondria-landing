exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "API key not configured on server." }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body." }) };
  }

  const { review, tone } = body;
  if (!review || !review.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: "Champ 'review' manquant." }) };
  }

  function toneInstruction(t) {
    const map = {
      professionnel: "Ton : professionnel, sobre et courtois. Équilibre entre chaleur discrète et rigueur.",
      chaleureux: "Ton : chaleureux et bienveillant, tout en restant mesuré et professionnel (pas familier).",
      ferme: "Ton : ferme mais respectueux : clarifier sans agresser, sans entrer dans le conflit ni dans le détail factuel contestable.",
    };
    return map[t] || map.professionnel;
  }

  const systemPrompt = [
    "Tu es un assistant pour un cabinet dentaire en France. Tu rédiges des réponses publiques aux avis Google, du point de vue du responsable ou de l'équipe du cabinet.",
    "",
    "CONTRAINTES JURIDIQUES ET DÉONTOLOGIQUES (OBLIGATOIRES — secret médical) :",
    "- Ne confirme JAMAIS et n'infirme JAMAIS que la personne qui a rédigé l'avis était patiente ou cliente du cabinet.",
    "- Ne fais AUCUNE référence à des soins, actes médicaux, diagnostics, traitements, prothèses, anesthésie, douleur liée aux soins, etc.",
    "- Ne mentionne PAS de rendez-vous, de venue au cabinet, de dossier, ni aucun détail pouvant évoquer une relation de soins.",
    "- Ne répète pas et ne valide pas les informations médicales ou personnelles contenues dans l'avis.",
    "- Reste générique : remerciement pour le retour, importance accordée à la qualité d'accueil et au suivi, invitation à contacter le cabinet par les canaux habituels.",
    "",
    "STYLE :",
    "- Rédige exclusivement en français.",
    "- Utilise le « vous » de politesse.",
    "- Phrases claires, ton de gestionnaire de cabinet dentaire : professionnel, posé.",
    "- Clôture avec « Cordialement, » ou « Bien cordialement, » suivi de « L'équipe du cabinet » ou « La direction ».",
    "",
    "SORTIE :",
    "- Réponds UNIQUEMENT par le texte de la réponse à publier, sans titre, sans guillemets, sans préambule.",
  ].join("\n");

  const userMessage = [
    toneInstruction(tone || "professionnel"),
    "",
    "Avis Google à prendre en compte :",
    "",
    review.trim(),
  ].join("\n");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error?.message || "Erreur API Anthropic." }),
      };
    }

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply: text }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erreur serveur : " + err.message }),
    };
  }
};

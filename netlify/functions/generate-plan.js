import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const { dogName, breed, age, sex, weight, activity, health, currentFood, budget } = body;

    if (!breed || !age) {
      return new Response(JSON.stringify({ error: "Breed and age are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const budgetMap = {
      "Smart Saver": "budget-friendly, affordable brands under $50 for a large bag",
      "Balanced Choice": "mid-range brands with good quality-to-price ratio, $50-90 range",
      "Premium Care": "top-tier premium brands, grain-free or fresh food options, $90+",
    };

    const budgetContext = budgetMap[budget] || "mid-range brands with good quality-to-price ratio";

    const prompt = `You are an expert canine nutritionist and dog wellness advisor with 20+ years of experience.

A dog owner needs a personalized plan for their dog. Here are the details:
- Name: ${dogName || "the dog"}
- Breed: ${breed}
- Age: ${age}
- Sex: ${sex || "Unknown"}
- Weight: ${weight || "Unknown"} kg
- Activity level: ${activity || "Unknown"}
- Health concerns: ${health || "None"}
- Current food type: ${currentFood || "Unknown"}
- Budget preference: ${budgetContext}

Please provide a detailed, practical, and friendly response with EXACTLY these 4 sections:

### 🍗 DIET & NUTRITION PLAN
Give daily calorie estimate, ideal macronutrient balance, feeding frequency, portion guidance, and key nutrients this specific breed needs. Be specific and practical.

### 🏷️ RECOMMENDED FOOD BRANDS
List 4-6 specific commercially available food brands that match the owner's budget preference (${budgetContext}). For each brand briefly explain WHY it fits this dog's profile (1 sentence). Do NOT mention prices — just recommend the brands. Focus on real brands like Royal Canin, Hill's Science Diet, Orijen, Purina Pro Plan, Blue Buffalo, Taste of the Wild, Iams, Eukanuba, etc.

### 🏃 LIFESTYLE & EXERCISE GUIDE
Recommend daily exercise duration, types of activities ideal for this breed and age, mental stimulation ideas, and breed-specific lifestyle tips.

### ⚠️ FOODS & RISKS TO AVOID
List foods toxic or harmful for this specific breed or health condition, plus breed-specific health risks to watch for.

Be warm, direct, and specific. Avoid generic advice. Tailor everything to this exact dog profile.`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";

    return new Response(JSON.stringify({ success: true, plan: responseText }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to generate plan", details: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/generate-plan",
};
const Anthropic = require("@anthropic-ai/sdk");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { dogName, breed, age, sex, weight, activity, health, currentFood, budget, email } = body;

    if (!breed || !age) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Breed and age are required" }),
      };
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
List 4-6 specific commercially available food brands that match the owner's budget preference (${budgetContext}). For each brand briefly explain WHY it fits this dog's profile (1 sentence). Do NOT mention prices. Focus on real brands like Royal Canin, Hill's Science Diet, Orijen, Purina Pro Plan, Blue Buffalo, Taste of the Wild, Iams, Eukanuba, etc.

### 🏃 LIFESTYLE & EXERCISE GUIDE
Recommend daily exercise duration, types of activities ideal for this breed and age, mental stimulation ideas, and breed-specific lifestyle tips.

### ⚠️ FOODS & RISKS TO AVOID
List foods toxic or harmful for this specific breed or health condition, plus breed-specific health risks to watch for.

Be warm, direct, and specific. Tailor everything to this exact dog profile.`;

    const client = new Anthropic.Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";

    // If email provided: add to Brevo list + send plan email
    if (email && process.env.BREVO_API_KEY) {
      const petName = dogName || "your dog";

      // 1. Add contact to Brevo list
      try {
        await fetch("https://api.brevo.com/v3/contacts", {
          method: "POST",
          headers: {
            "api-key": process.env.BREVO_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            attributes: { FIRSTNAME: petName, SOURCE: "DogDietAdvisor" },
            listIds: [2],
            updateEnabled: true,
          }),
        });
      } catch (e) {
        console.log("Brevo contact save error:", e.message);
      }

      // 2. Send the plan to the user's email
      try {
        const planHtml = responseText
          .replace(/### 🍗 DIET & NUTRITION PLAN/g, '<h2 style="color:#1E3A5F;margin-top:28px;">🍗 Diet & Nutrition Plan</h2>')
          .replace(/### 🏷️ RECOMMENDED FOOD BRANDS/g, '<h2 style="color:#1E3A5F;margin-top:28px;">🏷️ Recommended Food Brands</h2>')
          .replace(/### 🏃 LIFESTYLE & EXERCISE GUIDE/g, '<h2 style="color:#1E3A5F;margin-top:28px;">🏃 Lifestyle & Exercise Guide</h2>')
          .replace(/### ⚠️ FOODS & RISKS TO AVOID/g, '<h2 style="color:#1E3A5F;margin-top:28px;">⚠️ Foods & Risks to Avoid</h2>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/^[-•]\s+(.+)$/gm, '<li style="margin-bottom:4px;">$1</li>')
          .replace(/(<li.*<\/li>\n?)+/gs, m => `<ul style="padding-left:20px;margin:8px 0;">${m}</ul>`)
          .replace(/\n\n+/g, '</p><p style="margin:0 0 10px;">')
          .replace(/^/, '<p style="margin:0 0 10px;">')
          .replace(/$/, '</p>');

        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": process.env.BREVO_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: "DogDietAdvisor", email: "hello@dogdietadvisor.com" },
            to: [{ email }],
            subject: `🐾 ${petName}'s Personalized Nutrition Plan`,
            htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:0;background:#F4F1EC;">
  <div style="background:#1E3A5F;padding:28px 32px;text-align:center;">
    <h1 style="color:white;margin:0;font-size:22px;font-weight:700;">🐾 DogDietAdvisor</h1>
    <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:14px;">Personalized nutrition for every breed</p>
  </div>
  <div style="background:white;padding:32px;border-radius:0 0 12px 12px;">
    <h2 style="color:#1E3A5F;margin:0 0 6px;font-size:20px;">Here's ${petName}'s plan 🐶</h2>
    <p style="color:#7A8999;margin:0 0 24px;font-size:14px;">
      ${breed} · ${age}${weight ? ` · ${weight}kg` : ''}${health && health !== 'None' ? ` · ${health}` : ''}
    </p>
    <div style="color:#3A4D60;font-size:15px;line-height:1.7;">
      ${planHtml}
    </div>
    <div style="margin-top:28px;padding:18px 20px;background:#EBF5F0;border-radius:10px;border:1px solid rgba(74,140,111,0.2);">
      <p style="margin:0 0 12px;font-size:14px;color:#3A7A5E;font-weight:600;">🛒 Shop recommended brands</p>
      <a href="https://chewy.sjv.io/4arv0n" style="display:inline-block;background:#4A8C6F;color:white;padding:8px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin-right:8px;">Chewy</a>
      <a href="https://www.amazon.com/s?k=dog+food&tag=dogdietadviso-20" style="display:inline-block;background:#E8920A;color:white;padding:8px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">Amazon</a>
    </div>
    <p style="margin-top:24px;font-size:12px;color:#B0BECA;text-align:center;">
      ⚠️ This plan is for general wellness guidance only — not a substitute for veterinary advice.<br>
      <a href="https://dogdietadvisor.com" style="color:#4A8C6F;text-decoration:none;">dogdietadvisor.com</a>
    </p>
  </div>
</body>
</html>`,
          }),
        });
      } catch (e) {
        console.log("Brevo email send error:", e.message);
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, plan: responseText }),
    };

  } catch (error) {
    console.log("ERROR:", error.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to generate plan", details: error.message }),
    };
  }
};

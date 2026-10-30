PNEUMONIA_KEYWORDS = [
    "pneumonia", "chest", "xray", "x-ray", "lung", "breathing",
    "cough", "fever", "antibiotic", "medicine", "treatment",
    "oxygen", "severity", "mild", "moderate", "severe",
    "hospital", "doctor", "symptoms", "infection", "recovery",
    "inhaler", "tablet", "nebulizer", "sputum", "mucus",
    # Word stems so natural phrasings ("how long to recover?", "any symptom?") are not rejected
    "recover", "symptom", "medication", "drug", "spo2", "saturation",
    "breathe", "breath", "emergency", "result", "report", "diagnos"
]

SEVERITY_DATA = {
    "Normal": {
        "initial": "Great news! No pneumonia detected. Your lungs appear healthy.",
        "advice": [
            "Maintain good respiratory hygiene",
            "Wash hands regularly for at least 20 seconds",
            "Annual chest X-ray recommended as precaution",
            "Stay vaccinated — flu and pneumococcal vaccines",
            "Avoid smoking and air pollution",
            "Exercise regularly to maintain lung health"
        ]
    },
    "Mild Pneumonia": {
        "initial": "Mild pneumonia detected. You can recover at home with proper care.",
        "advice": [
            "Complete rest at home for 5-7 days",
            "Antibiotic: Amoxicillin 500mg 3 times daily for 7 days",
            "Drink 8+ glasses of water daily",
            "Paracetamol 500mg for fever every 6 hours if needed",
            "Steam inhalation twice daily for 10 minutes",
            "Follow-up chest X-ray in 1 week",
            "Monitor temperature twice daily",
            "Avoid cold drinks and air conditioning"
        ]
    },
    "Moderate Pneumonia": {
        "initial": "Moderate pneumonia detected. Please consult a doctor immediately.",
        "advice": [
            "Visit a pulmonologist TODAY — do not delay",
            "Antibiotics: Azithromycin 500mg + Amoxicillin-Clavulanate 625mg",
            "Monitor oxygen saturation — must stay above 95%",
            "Complete bed rest — no physical exertion",
            "Breathing exercises 3 times daily",
            "Hospital observation may be needed if no improvement in 48 hours",
            "Follow-up with doctor in 3 days",
            "High protein diet — eggs, dal, fish for recovery"
        ]
    },
    "Severe Pneumonia": {
        "initial": "SEVERE pneumonia detected. Go to emergency immediately.",
        "advice": [
            "GO TO EMERGENCY ROOM IMMEDIATELY",
            "IV antibiotics required: Ceftriaxone 1g + Azithromycin 500mg",
            "Oxygen therapy will be needed",
            "ICU monitoring if SpO2 falls below 90%",
            "Inform family members immediately",
            "Do NOT drive yourself — call ambulance",
            "Complete bed rest — no movement",
            "Do not eat or drink until doctor evaluates"
        ]
    }
}


def get_bot_response(message: str, severity: str) -> str:
    message_lower = message.lower()
    is_pneumonia_related = any(keyword in message_lower for keyword in PNEUMONIA_KEYWORDS)

    if not is_pneumonia_related:
        return "I can only assist with pneumonia-related queries. Please ask me about symptoms, treatment, medications, or recovery."

    severity_key = severity if severity in SEVERITY_DATA else "Normal"
    data = SEVERITY_DATA[severity_key]

    if any(w in message_lower for w in ["medicine", "medication", "antibiotic", "tablet", "drug"]):
        meds = [a for a in data["advice"] if any(x in a.lower() for x in ["mg", "antibiotic", "amoxicillin", "azithromycin", "ceftriaxone", "paracetamol"])]
        if meds:
            return "Recommended medications for " + severity_key + ":\n" + "\n".join("• " + m for m in meds)
        return "Please consult your doctor for specific medication advice."

    elif any(w in message_lower for w in ["hospital", "emergency", "admit", "serious"]):
        if "Severe" in severity_key:
            return "YES — go to emergency immediately. Severe pneumonia requires hospitalization, IV antibiotics, and oxygen therapy. Do not delay."
        elif "Moderate" in severity_key:
            return "Hospital observation may be needed. Consult a pulmonologist today. If oxygen drops below 95%, go to emergency immediately."
        else:
            return "For mild pneumonia, home rest is usually sufficient. Follow up with your doctor in a week."

    elif any(w in message_lower for w in ["symptom", "sign", "feel", "pain"]):
        return "Common pneumonia symptoms: fever, chills, cough with mucus, chest pain when breathing, shortness of breath, fatigue, and loss of appetite. Severe cases may show confusion and bluish lips."

    elif any(w in message_lower for w in ["recover", "better", "how long", "time", "days", "weeks"]):
        times = {
            "Normal": "No pneumonia — no recovery needed.",
            "Mild Pneumonia": "1-2 weeks with proper home rest and antibiotics.",
            "Moderate Pneumonia": "2-4 weeks with medical treatment and follow-up.",
            "Severe Pneumonia": "4-8 weeks with hospitalization and intensive care."
        }
        return "Recovery time for " + severity_key + ": " + times.get(severity_key, "2-4 weeks. Follow your doctor's advice strictly.")

    elif any(w in message_lower for w in ["oxygen", "spo2", "saturation", "breathe"]):
        return "Oxygen saturation (SpO2) should stay above 95% for Mild, above 94% for Moderate. If it drops below 90%, seek emergency care immediately. Use a pulse oximeter to monitor at home."

    else:
        return data["initial"] + "\n\nKey recommendations:\n" + "\n".join("• " + a for a in data["advice"][:4])

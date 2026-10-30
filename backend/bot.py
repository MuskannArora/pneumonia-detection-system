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

# Warning signs that need emergency care whatever the predicted severity
RED_FLAGS = [
    "Oxygen saturation (SpO2) below 92% on a pulse oximeter",
    "Breathing faster than 30 breaths per minute, or severe breathlessness at rest",
    "Confusion, drowsiness or difficulty waking up",
    "Bluish lips, face or fingertips",
    "Sharp chest pain when breathing or coughing",
    "Coughing up blood",
    "High fever (above 39.5 °C / 103 °F) that does not come down with medicine",
    "Low blood pressure, cold clammy skin or fainting"
]

# Structured clinical guidance shown in the result panel and the downloadable report
CLINICAL_GUIDANCE = {
    "Normal": {
        "urgency": "Routine",
        "urgency_level": "routine",
        "care_setting": "No pneumonia pattern detected. Routine care; no pneumonia-specific treatment is indicated.",
        "summary": "The chest X-ray does not show the lung opacity pattern the model associates with pneumonia.",
        "next_steps": [
            "If fever, cough or breathlessness are present, still see a doctor: early pneumonia can look normal on an X-ray",
            "Have a radiologist confirm the X-ray report",
            "Continue usual medicines and healthy habits"
        ],
        "tests": [
            "No further tests needed for pneumonia if there are no symptoms",
            "If symptomatic: clinical examination, complete blood count (CBC) and CRP"
        ],
        "monitoring": [
            "Watch for new fever, cough or shortness of breath",
            "SpO2 should normally be 95% or higher"
        ],
        "follow_up": "Routine check-up. Repeat imaging only if symptoms appear or persist.",
        "recovery": "No recovery period needed.",
    },
    "Mild Pneumonia": {
        "urgency": "Consult a doctor within 24 hours",
        "urgency_level": "mild",
        "care_setting": "Outpatient / home care under a doctor's supervision.",
        "summary": "The X-ray shows findings consistent with mild pneumonia. Most patients recover at home with treatment.",
        "next_steps": [
            "Book a doctor (general physician) visit within 24 hours to confirm the diagnosis and start treatment",
            "Doctor may calculate a CURB-65 score to confirm home treatment is safe",
            "Rest at home, drink plenty of fluids and avoid exertion"
        ],
        "tests": [
            "Complete blood count (CBC) and C-reactive protein (CRP)",
            "Pulse oximetry (SpO2)",
            "Sputum culture if the cough is productive"
        ],
        "monitoring": [
            "Check temperature twice daily",
            "Check SpO2 twice daily; it should stay at 95% or higher",
            "Note breathing rate and any worsening of cough or breathlessness"
        ],
        "follow_up": "Doctor review in 2–3 days if not improving; follow-up chest X-ray in about 1 week or as advised.",
        "recovery": "Usually 1–2 weeks with rest and treatment; tiredness can last longer.",
    },
    "Moderate Pneumonia": {
        "urgency": "See a doctor today",
        "urgency_level": "moderate",
        "care_setting": "Same-day pulmonologist / physician review. Hospital observation may be needed.",
        "summary": "The X-ray shows findings consistent with moderate pneumonia. This needs prompt medical evaluation and close monitoring.",
        "next_steps": [
            "Visit a pulmonologist or physician today; do not wait",
            "Doctor should assess CURB-65 score to decide between home treatment and admission",
            "Go to the hospital immediately if SpO2 falls below 94% or breathing worsens"
        ],
        "tests": [
            "Complete blood count (CBC), CRP and procalcitonin",
            "Kidney function (urea, creatinine) and electrolytes",
            "Sputum culture and blood culture",
            "Arterial blood gas (ABG) if SpO2 is low"
        ],
        "monitoring": [
            "Check SpO2 every 4–6 hours; target 94% or higher",
            "Monitor temperature, breathing rate and pulse",
            "Watch for confusion or reduced urine output"
        ],
        "follow_up": "Doctor review within 48–72 hours; repeat chest X-ray as advised by the treating doctor.",
        "recovery": "Usually 2–4 weeks with treatment and follow-up.",
    },
    "Severe Pneumonia": {
        "urgency": "Emergency — seek care immediately",
        "urgency_level": "severe",
        "care_setting": "Emergency department / hospital admission. ICU care may be required.",
        "summary": "The X-ray shows findings consistent with severe pneumonia. This is a medical emergency.",
        "next_steps": [
            "Go to the emergency room now; call an ambulance and do not drive yourself",
            "Bring this report and any previous X-rays or prescriptions",
            "Inform family members"
        ],
        "tests": [
            "Arterial blood gas (ABG) and continuous SpO2 monitoring",
            "Blood cultures before antibiotics, sputum culture",
            "CBC, CRP, procalcitonin, serum lactate",
            "Kidney and liver function tests, electrolytes",
            "CURB-65 / severity score to decide on ICU admission"
        ],
        "monitoring": [
            "Continuous oxygen saturation monitoring in hospital",
            "ICU review if SpO2 falls below 90% despite oxygen",
            "Hourly vital signs: breathing rate, blood pressure, pulse, consciousness"
        ],
        "follow_up": "Managed by the hospital team. Follow-up chest X-ray about 6 weeks after recovery.",
        "recovery": "Usually 4–8 weeks, including hospital stay and recovery at home.",
    }
}

BORDERLINE_MARGIN = 0.05


def get_clinical_assistance(prediction: str, probability: float, severity: str, threshold: float) -> dict:
    """Clinical guidance for a prediction: severity guidance plus notes that depend on this specific score."""
    severity_key = severity if severity in CLINICAL_GUIDANCE else "Normal"
    guidance = CLINICAL_GUIDANCE[severity_key]

    notes = []
    if abs(probability - threshold) < BORDERLINE_MARGIN:
        notes.append(
            f"Borderline result: the pneumonia score ({probability * 100:.1f}%) is close to the "
            f"{threshold * 100:.0f}% decision threshold. Radiologist review and clinical correlation are strongly recommended."
        )
    if prediction == "Normal" and probability >= 0.35:
        notes.append("The score is not very low. If the patient has symptoms, treat this X-ray as inconclusive and consult a doctor.")
    if severity_key == "Severe Pneumonia":
        notes.append("Do not delay treatment while waiting for further tests.")
    notes.append("Medicines and doses must be prescribed by a doctor after examining the patient. Do not self-medicate.")

    return {
        "severity": severity_key,
        "urgency": guidance["urgency"],
        "urgency_level": guidance["urgency_level"],
        "care_setting": guidance["care_setting"],
        "summary": guidance["summary"],
        "next_steps": guidance["next_steps"],
        "tests": guidance["tests"],
        "treatment": SEVERITY_DATA[severity_key]["advice"],
        "monitoring": guidance["monitoring"],
        "red_flags": RED_FLAGS,
        "follow_up": guidance["follow_up"],
        "recovery": guidance["recovery"],
        "notes": notes
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

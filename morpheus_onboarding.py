# This is a Python onboarding script for Morpheus CRM
# Updated with morpheuscr.com references

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from datetime import datetime

W, H = letter
MAR = 36
INNER = W - MAR * 2

NAVY = (13, 27, 42)
BLUE = (93, 202, 165)
GRAY = (140, 155, 170)
RULE = colors.HexColor('#CBD8E6')
WHITE = colors.HexColor('FFFFFF')

def body_text(c, y, text, indent=0):
    c.setFont('Helvetica', 10)
    c.setFillColor(*GRAY)
    wrapped_text = c.beginText(MAR + indent, y)
    wrapped_text.setFont('Helvetica', 10)
    wrapped_text.textLines(text, maxWidth=INNER - indent)
    c.drawText(wrapped_text)
    return y - (len(text.split()) // 8 + 1) * 14

def bullet(c, y, text, indent=0):
    c.setFont('Helvetica', 9.5)
    c.setFillColor(*GRAY)
    c.drawString(MAR + indent, y, '• ' + text)
    return y - 12

def section_header(c, y, title):
    c.setFillColor(*BLUE)
    c.rect(MAR, y - 16, INNER, 20, fill=1, stroke=0)
    c.setFont('Helvetica-Bold', 11)
    c.setFillColor(255, 255, 255)
    c.drawString(MAR + 8, y - 11, title)
    return y - 28

# Example documentation snippet for morpheuscr.com
y = H - MAR
y = body_text(c, y, "If a participant or trainer cannot log in:", indent=4)
y = bullet(c, y, "Direct them to the 'Forgot password?' link on the morpheuscr.com login page")
y = bullet(c, y, "A reset link will be sent to their email address")
y = bullet(c, y, "If the email address is wrong, a super admin must update it in the Supabase dashboard")

y -= 10
y = section_header(c, y, "15. Quick reference")
y -= 4

rows = [
    ["Action",                    "Where",                "Notes"],
    ["Log in",                    "morpheuscr.com",      "Email + password"],
    ["Enroll participant",        "Participants → +Enroll","3-step form, CTS ID auto-assigned"],
    ["Create cohort",             "Cohorts → +New cohort","Set name, source, trainer, dates"],
    ["Run AI mock call",          "AI Call Simulator",    "Select participant, generate, start"],
    ["Self-serve practice call",  "Participant portal",   "Participants run their own calls"],
    ["View profile + history",    "Participants → row",   "All calls, scores, category bars"],
    ["Export LDSS report",        "Profile → Export PDF", "Proprietary Morpheus PDF"],
    ["Issue certificate",         "Profile → Issue cert", "Auto-triggers at 80+ avg / 5+ calls"],
    ["Adjust scoring weights",    "Score Matrix",         "Must total 100%; global or per-cohort"],
    ["Create staff account",      "Admin Panel",          "Super admin only"],
    ["Password reset",            "Login → Forgot pwd",   "Email link sent automatically"],
]

y -= 14
y = section_header(c, y, "Support")
y = body_text(c, y, "Technical issues:   Contact your Morpheus super admin or program director.", indent=4)
y = body_text(c, y, "LDSS documentation: Contact LDSS Albany Workforce Solutions or LDSS Schenectady Workforce Solutions directly.", indent=4)
y = body_text(c, y, "Platform:           morpheuscr.com  ·  Certified Training Standards  ·  Albany, NY", indent=4)

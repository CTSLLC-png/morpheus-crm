#!/usr/bin/env python3
"""
Morpheus CRM — Trainer Onboarding Guide Generator
Sprint 4, Task 4-5
Certified Training Standards · Albany, NY · morpheuscrm.com
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib import colors
import datetime

W, H = letter
MAR  = 0.75 * inch
INNER = W - 2 * MAR

NAVY   = colors.HexColor("#0D1B2A")
MIDBL  = colors.HexColor("#1B3A5C")
BLUE   = colors.HexColor("#2176AE")
TEAL   = colors.HexColor("#0F6E56")
AMBER  = colors.HexColor("#BA7517")
RULE   = colors.HexColor("#CBD8E6")
SURF   = colors.HexColor("#F7F9FC")
GRAY   = colors.HexColor("#4A6080")
WHITE  = colors.white

def draw_header(c, page_num, total_pages, section=""):
    c.setFillColor(NAVY)
    c.rect(0, H - 54, W, 54, fill=1, stroke=0)
    # Logo
    c.setStrokeColor(BLUE)
    c.setLineWidth(1.8)
    lx, ly = MAR, H - 38
    c.line(lx, ly, lx, ly + 26)
    c.line(lx, ly + 26, lx + 10, ly + 16)
    c.line(lx + 10, ly + 16, lx + 20, ly + 26)
    c.line(lx + 20, ly + 26, lx + 20, ly)
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(WHITE)
    c.drawString(MAR + 28, H - 28, "MORPHEUS")
    c.setFont("Helvetica", 7.5)
    c.setFillColor(colors.HexColor("#8BAFC8"))
    c.drawString(MAR + 29, H - 41, "Trainer Onboarding Guide  ·  Certified Training Standards")
    if section:
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(WHITE)
        c.drawRightString(W - MAR, H - 28, section)
    c.setFont("Helvetica", 7.5)
    c.setFillColor(colors.HexColor("#8BAFC8"))
    c.drawRightString(W - MAR, H - 41, f"Page {page_num} of {total_pages}")

def draw_footer(c):
    c.setStrokeColor(RULE)
    c.setLineWidth(0.5)
    c.line(MAR, 40, W - MAR, 40)
    c.setFont("Helvetica", 6.5)
    c.setFillColor(GRAY)
    c.drawString(MAR, 28, "Morpheus CRM  ·  Certified Training Standards  ·  Albany, NY  ·  morpheuscrm.com")
    c.drawRightString(W - MAR, 28, f"© {datetime.date.today().year} Certified Training Standards. Proprietary & Confidential.")

def section_header(c, y, text, color=NAVY):
    c.setFillColor(colors.HexColor("#E6F1FB"))
    c.rect(MAR, y - 5, INNER, 22, fill=1, stroke=0)
    c.setFillColor(BLUE)
    c.rect(MAR, y - 5, 3, 22, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(NAVY)
    c.drawString(MAR + 10, y + 7, text.upper())
    return y - 30

def body_text(c, y, text, indent=0, bold=False):
    font = "Helvetica-Bold" if bold else "Helvetica"
    c.setFont(font, 9)
    c.setFillColor(GRAY if not bold else NAVY)
    c.drawString(MAR + indent, y, text)
    return y - 14

def bullet(c, y, text, level=0):
    indent = 12 + level * 16
    dot_x = MAR + indent
    c.setFillColor(BLUE)
    c.circle(dot_x, y + 3, 2, fill=1, stroke=0)
    c.setFont("Helvetica", 9)
    c.setFillColor(GRAY)
    # Wrap long lines
    lines = []
    words = text.split()
    line = ""
    max_w = INNER - indent - 18
    for word in words:
        test = (line + " " + word).strip()
        if c.stringWidth(test, "Helvetica", 9) < max_w:
            line = test
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    c.drawString(dot_x + 10, y, lines[0])
    for extra in lines[1:]:
        y -= 13
        c.drawString(dot_x + 10, y, extra)
    return y - 14

def step_box(c, y, num, title, desc):
    c.setFillColor(NAVY)
    c.circle(MAR + 10, y - 2, 10, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(WHITE)
    c.drawCentredString(MAR + 10, y - 6, str(num))
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(NAVY)
    c.drawString(MAR + 26, y, title)
    c.setFont("Helvetica", 9)
    c.setFillColor(GRAY)
    c.drawString(MAR + 26, y - 13, desc)
    return y - 32

def note_box(c, y, text, color=AMBER, bg=colors.HexColor("#FAEEDA")):
    h = 36
    c.setFillColor(bg)
    c.roundRect(MAR, y - h, INNER, h, 5, fill=1, stroke=0)
    c.setFillColor(color)
    c.rect(MAR, y - h, 3, h, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(color)
    c.drawString(MAR + 10, y - 12, "NOTE")
    c.setFont("Helvetica", 8.5)
    c.setFillColor(NAVY)
    c.drawString(MAR + 40, y - 12, text[:90])
    if len(text) > 90:
        c.drawString(MAR + 10, y - 24, text[90:180])
    return y - h - 10

def generate_guide(out_path):
    c = canvas.Canvas(out_path, pagesize=letter)
    c.setTitle("Morpheus CRM — Trainer Onboarding Guide")
    c.setAuthor("Certified Training Standards")
    today = datetime.date.today().strftime("%B %d, %Y")

    TOTAL = 6
    # ─────────────────────────────────── PAGE 1: COVER
    draw_header(c, 1, TOTAL, "Welcome")
    draw_footer(c)

    # Cover hero
    c.setFillColor(SURF)
    c.roundRect(MAR, H/2 - 80, INNER, 220, 10, fill=1, stroke=0)
    c.setStrokeColor(RULE); c.setLineWidth(0.5)
    c.roundRect(MAR, H/2 - 80, INNER, 220, 10, fill=0, stroke=1)

    c.setFont("Helvetica-Bold", 28)
    c.setFillColor(NAVY)
    c.drawCentredString(W/2, H/2 + 100, "Trainer Onboarding Guide")
    c.setFont("Helvetica", 13)
    c.setFillColor(GRAY)
    c.drawCentredString(W/2, H/2 + 76, "Morpheus CRM — Certified Training Standards")
    c.setFont("Helvetica", 10)
    c.drawCentredString(W/2, H/2 + 56, "Albany, NY  ·  morpheuscrm.com")

    c.setStrokeColor(BLUE); c.setLineWidth(1)
    c.line(W/2 - 80, H/2 + 44, W/2 + 80, H/2 + 44)

    c.setFont("Helvetica", 10)
    c.setFillColor(GRAY)
    items = [
        "Enrolling participants and managing cohorts",
        "Running AI mock call sessions",
        "Interpreting scores and the rubric",
        "Issuing LDSS reports and certificates",
        "System administration and account management",
    ]
    yy = H/2 + 20
    for item in items:
        c.setFillColor(TEAL); c.circle(W/2 - 90, yy + 3, 2.5, fill=1, stroke=0)
        c.setFont("Helvetica", 9.5); c.setFillColor(NAVY)
        c.drawString(W/2 - 82, yy, item)
        yy -= 16

    c.setFont("Helvetica", 8); c.setFillColor(GRAY)
    c.drawCentredString(W/2, H/2 - 60, f"Version 1.0  ·  Effective {today}  ·  Proprietary & Confidential")

    c.showPage()

    # ─────────────────────────────────── PAGE 2: GETTING STARTED
    draw_header(c, 2, TOTAL, "Getting Started")
    draw_footer(c)
    y = H - 80

    y = section_header(c, y, "1. Logging into Morpheus")
    y = body_text(c, y, "Open your browser and go to morpheuscrm.com", indent=4)
    y = bullet(c, y, "Enter your trainer email and temporary password")
    y = bullet(c, y, "You will be prompted to set a new password on first login")
    y = bullet(c, y, "Trainers see the full workspace: Dashboard, AI Call Simulator, Participants, Cohorts & Reports, Score Matrix")
    y = bullet(c, y, "Super admins additionally see the Admin Panel for account management")
    y -= 8
    y = note_box(c, y, "If you cannot log in, contact your program admin to verify your account was created with role: trainer.")

    y -= 6
    y = section_header(c, y, "2. Dashboard overview")
    y = body_text(c, y, "The dashboard shows four live metrics pulled from the Morpheus database:", indent=4)
    y = bullet(c, y, "Active participants — all enrolled participants across all cohorts")
    y = bullet(c, y, "Calls logged to DB — every completed AI mock call session saved to Morpheus")
    y = bullet(c, y, "Avg score — weighted average across all scored calls, all participants")
    y = bullet(c, y, "Certs issued — participants who have reached 80+ avg across 5+ calls")
    y -= 4
    y = body_text(c, y, "The cohort table shows each cohort's program source, participant count, total calls, and average score.", indent=4)

    y -= 10
    y = section_header(c, y, "3. Your first task: create a cohort")
    steps = [
        ("Navigate", "Go to Cohorts & Reports in the left navigation"),
        ("Create",   "Click '+ New cohort' and fill in the cohort name, program source, start date, and lead trainer"),
        ("Save",     "Click 'Create cohort' — the cohort appears immediately in the dashboard"),
        ("Enroll",   "Click '+ Enroll participant' on the cohort card to add participants"),
    ]
    for i, (title, desc) in enumerate(steps, 1):
        y = step_box(c, y, i, title, desc)

    c.showPage()

    # ─────────────────────────────────── PAGE 3: PARTICIPANTS
    draw_header(c, 3, TOTAL, "Participant Management")
    draw_footer(c)
    y = H - 80

    y = section_header(c, y, "4. Enrolling a new participant")
    y = body_text(c, y, "Click '+ Enroll participant' in the top-right of any screen, or from Participants → Enroll participant.", indent=4)
    y -= 4
    steps = [
        ("Step 1 — Personal info", "Enter full name, date of birth, email address, and set a temporary password"),
        ("Step 2 — Program info",   "Select program source (LDSS Albany, LDSS Schenectady, Reentry, or Direct). LDSS office auto-fills. Add case number, caseworker, assigned trainer, and cohort"),
        ("Step 3 — Review",         "Confirm all details. Click 'Enroll participant' to create the account"),
        ("Auto-generated CTS ID",   "Morpheus assigns a unique CTS-XXXXX identifier immediately on enrollment"),
    ]
    for i, (title, desc) in enumerate(steps, 1):
        y = step_box(c, y, i, title, desc)

    y -= 6
    y = note_box(c, y, "The participant's email and temporary password are their Morpheus login credentials. They should change the password on first login.", color=BLUE, bg=colors.HexColor("#E6F1FB"))

    y -= 6
    y = section_header(c, y, "5. Participant profile page")
    y = body_text(c, y, "Click any participant row to open their full profile. You will see:", indent=4)
    y = bullet(c, y, "Identity card — name, CTS ID, program source, LDSS case number, caseworker, assigned trainer")
    y = bullet(c, y, "Stats row — calls completed, average score, best score, certification threshold")
    y = bullet(c, y, "Category performance bars — average across all 6 rubric categories")
    y = bullet(c, y, "Call history — every session with expandable score detail and AI feedback")
    y = bullet(c, y, "Export LDSS report — generates a proprietary Morpheus PDF for caseworker submission")
    y = bullet(c, y, "Issue certificate — appears when participant meets 80+ avg across 5+ calls")
    y -= 4
    y = body_text(c, y, "You can add trainer notes to any individual call by expanding the call row and using the notes field.", indent=4)

    y -= 10
    y = section_header(c, y, "6. Participant self-service portal")
    y = body_text(c, y, "Participants log into morpheuscrm.com with their own credentials and see a separate portal:", indent=4)
    y = bullet(c, y, "My Dashboard — greeting, stats, recent call history, certification badge if earned")
    y = bullet(c, y, "Practice Calls — self-directed AI mock call simulator, scores shown immediately on completion")
    y = bullet(c, y, "My Progress — category averages and full call log")
    y -= 4
    y = body_text(c, y, "Every call completed by a participant — whether trainer-run or self-directed — saves automatically to the Morpheus database and appears on their profile.", indent=4)

    c.showPage()

    # ─────────────────────────────────── PAGE 4: AI SIMULATOR
    draw_header(c, 4, TOTAL, "AI Call Simulator")
    draw_footer(c)
    y = H - 80

    y = section_header(c, y, "7. Running an AI mock call session")
    y = body_text(c, y, "Navigate to AI Call Simulator in the left nav. This is where you run trainer-administered sessions.", indent=4)
    y -= 4
    steps = [
        ("Select participant", "Choose the participant from the dropdown — only active enrolled participants appear"),
        ("Choose scenario",    "Select a scenario type (billing dispute, account setup, service outage, etc.) and difficulty (Beginner, Intermediate, Advanced)"),
        ("Generate",           "Click 'Generate scenario' — Claude AI writes a unique brief and the caller's opening line"),
        ("Start call",         "Click 'Start call'. The AI caller speaks first. You type responses on behalf of the participant"),
        ("End & score",        "Click 'End & score' when done. Claude scores the full transcript against the rubric — results appear within seconds"),
        ("Add trainer note",   "After scoring, type an observation in the notes field and click 'Save note' to attach it to the session record"),
    ]
    for i, (title, desc) in enumerate(steps, 1):
        y = step_box(c, y, i, title, desc)

    y -= 6
    y = note_box(c, y, "The full transcript and all six category scores save automatically to Morpheus on completion. No manual save needed.")

    y -= 10
    y = section_header(c, y, "8. Interpreting scores")
    y = body_text(c, y, "Every call is scored on six weighted categories. The weighted total determines the participant's session score:", indent=4)
    cats = [
        ("Opening / Greeting",   "15%", "Professional identification, warm welcome"),
        ("Active Listening",     "20%", "No interruptions, clarifying questions"),
        ("Empathy & Tone",       "20%", "Genuine emotion acknowledgment, consistent tone"),
        ("Problem Resolution",   "25%", "Root cause identified, solution confirmed"),
        ("Policy Adherence",     "10%", "No unauthorized promises"),
        ("Closing",              "10%", "Summary, satisfaction confirmed, sign-off"),
    ]
    y -= 6
    for cat, weight, desc in cats:
        c.setFont("Helvetica-Bold", 9); c.setFillColor(NAVY)
        c.drawString(MAR + 8, y, cat)
        c.setFont("Helvetica-Bold", 9); c.setFillColor(BLUE)
        c.drawString(MAR + 165, y, weight)
        c.setFont("Helvetica", 9); c.setFillColor(GRAY)
        c.drawString(MAR + 205, y, desc)
        y -= 14

    y -= 6
    c.setFillColor(colors.HexColor("#E1F5EE"))
    c.roundRect(MAR, y - 24, INNER, 24, 4, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 9); c.setFillColor(TEAL)
    c.drawString(MAR + 10, y - 14, "Score guide:  0–59 = Unsatisfactory   60–79 = Developing   80–100 = Proficient")
    y -= 34

    y = section_header(c, y, "9. Adjusting score matrix weights")
    y = body_text(c, y, "Navigate to Score Matrix. You can adjust category weights globally or per cohort.", indent=4)
    y = bullet(c, y, "Select 'Global default' to apply to all cohorts, or pick a specific cohort for an override")
    y = bullet(c, y, "Drag the sliders or type percentages directly — the total must equal exactly 100%")
    y = bullet(c, y, "Click 'Save weights' — changes apply to all future scored calls immediately")
    y = bullet(c, y, "The Rubric descriptors tab shows the three-level descriptions for each category")

    c.showPage()

    # ─────────────────────────────────── PAGE 5: REPORTS & CERTS
    draw_header(c, 5, TOTAL, "Reports & Certification")
    draw_footer(c)
    y = H - 80

    y = section_header(c, y, "10. Exporting LDSS progress reports")
    y = body_text(c, y, "Open a participant profile and click 'Export LDSS report'. Morpheus generates a proprietary PDF containing:", indent=4)
    y = bullet(c, y, "Participant information — name, CTS ID, DOB, enrollment date, trainer, LDSS office, case number, caseworker")
    y = bullet(c, y, "Call evaluation log — every scored session with all six category scores and color-coded totals")
    y = bullet(c, y, "Category performance summary — visual bars showing averages across all calls")
    y = bullet(c, y, "Certification status block — shows 'Certified' with date or 'In Training' with progress")
    y = bullet(c, y, "Trainer observations — notes field from the participant record")
    y = bullet(c, y, "Proprietary footer — Report ID, confidentiality notice, © Certified Training Standards")
    y -= 4
    y = body_text(c, y, "The PDF downloads automatically to your machine. Submit it to the LDSS caseworker as program documentation.", indent=4)

    y -= 10
    y = note_box(c, y, "Each LDSS report carries a unique MPR-YYYY-XXXX report ID and a CONFIDENTIAL stamp. These are proprietary Morpheus documents.", color=TEAL, bg=colors.HexColor("#E1F5EE"))

    y -= 10
    y = section_header(c, y, "11. Issuing a certificate (manual route)")
    y = body_text(c, y, "Morpheus monitors every participant's cumulative average automatically. When a participant:", indent=4)
    y = bullet(c, y, "Achieves a weighted average of 80 or above")
    y = bullet(c, y, "Across a minimum of 5 completed and scored calls")
    y -= 4
    y = body_text(c, y, "…their profile shows 'Cert eligible' in amber. The certification banner also appears in their participant portal.", indent=4)
    y -= 8
    y = body_text(c, y, "To issue the certificate:", indent=4, bold=True)
    y = bullet(c, y, "Open the participant's profile page")
    y = bullet(c, y, "Click 'Issue certificate' — only appears when eligibility is met")
    y = bullet(c, y, "Morpheus saves the certification record to the database with a unique MPR-YYYY-XXXX certificate number")
    y = bullet(c, y, "The branded certificate PDF downloads automatically — landscape format, gold seal, signature lines")
    y = bullet(c, y, "The participant's portal immediately shows their certification badge")
    y -= 6
    y = note_box(c, y, "Certificates are permanent records. If a certificate must be revoked, contact your super admin to update the status in the database.", color=AMBER, bg=colors.HexColor("#FAEEDA"))

    y -= 10
    y = section_header(c, y, "12. Cohort reports and exports")
    y = body_text(c, y, "From Cohorts & Reports, each cohort card has an 'Export PDF' button that generates a cohort-level summary.", indent=4)
    y = bullet(c, y, "Shows all enrolled participants, individual averages, and cohort aggregate score")
    y = bullet(c, y, "Formatted for LDSS Albany and LDSS Schenectady submission requirements")
    y = bullet(c, y, "Carry the same proprietary Morpheus branding and confidentiality footer")

    c.showPage()

    # ─────────────────────────────────── PAGE 6: ADMIN & QUICK REF
    draw_header(c, 6, TOTAL, "Admin & Quick Reference")
    draw_footer(c)
    y = H - 80

    y = section_header(c, y, "13. Creating accounts (super admin only)")
    y = body_text(c, y, "Navigate to Admin Panel (visible to super admins only). Use the 'Create account' tab:", indent=4)
    y = bullet(c, y, "Select the role: Participant, Trainer, or Super Admin")
    y = bullet(c, y, "Enter full name, email, and temporary password")
    y = bullet(c, y, "For participants, select program source — CTS ID is auto-generated on creation")
    y = bullet(c, y, "For trainers, enter job title — they will appear in the Staff Directory immediately")
    y -= 4
    y = body_text(c, y, "The Staff Directory tab shows all trainer accounts. System Status tab confirms database and API connectivity.", indent=4)

    y -= 10
    y = section_header(c, y, "14. Password resets")
    y = body_text(c, y, "If a participant or trainer cannot log in:", indent=4)
    y = bullet(c, y, "Direct them to the 'Forgot password?' link on the morpheuscrm.com login page")
    y = bullet(c, y, "A reset link will be sent to their email address")
    y = bullet(c, y, "If the email address is wrong, a super admin must update it in the Supabase dashboard")

    y -= 10
    y = section_header(c, y, "15. Quick reference")
    y -= 4

    rows = [
        ["Action",                    "Where",                "Notes"],
        ["Log in",                    "morpheuscrm.com",      "Email + password"],
        ["Enroll participant",        "Participants → +Enroll","3-step form, CTS ID auto-assigned"],
        ["Create cohort",             "Cohorts → +New cohort","Set name, source, trainer, dates"],
        ["Run AI mock call",          "AI Call Simulator",    "Select participant, generate, start"],
        ["Self-serve practice call",  "Participant portal",   "Participants run their own calls"],
        ["View profile + history",    "Participants → row",   "All calls, scores, category bars"],
        ["Export LDSS report",        "Profile → Export PDF", "Proprietary Morpheus PDF"],
        ["Issue certificate",         "Profile → Issue cert", "Auto-triggers at 80+ avg / 5+ calls"],
        ["Adjust scoring weights",    "Score Matrix",         "Must total 100%; global or per-cohort"],
        ["Create staff account",      "Admin Panel",          "Super admin only"],
        ["Password reset",            "Login → Forgot pwd",  "Email link sent automatically"],
    ]

    col_w = [INNER * 0.34, INNER * 0.33, INNER * 0.33]
    row_h = 18
    for i, row in enumerate(rows):
        bg = NAVY if i == 0 else (colors.HexColor("#F7F9FC") if i % 2 == 0 else WHITE)
        c.setFillColor(bg)
        c.rect(MAR, y - row_h, INNER, row_h, fill=1, stroke=0)
        x = MAR
        for j, (cell, cw) in enumerate(zip(row, col_w)):
            font  = "Helvetica-Bold" if i == 0 else ("Helvetica-Bold" if j == 0 else "Helvetica")
            color = WHITE if i == 0 else (NAVY if j == 0 else GRAY)
            c.setFont(font, 8)
            c.setFillColor(color)
            c.drawString(x + 6, y - row_h + 5, cell)
            x += cw
        c.setStrokeColor(RULE)
        c.setLineWidth(0.3)
        c.line(MAR, y - row_h, W - MAR, y - row_h)
        y -= row_h

    y -= 14
    y = section_header(c, y, "Support")
    y = body_text(c, y, "Technical issues:   Contact your Morpheus super admin or program director.", indent=4)
    y = body_text(c, y, "LDSS documentation: Contact LDSS Albany Workforce Solutions or LDSS Schenectady Workforce Solutions directly.", indent=4)
    y = body_text(c, y, "Platform:           morpheuscrm.com  ·  Certified Training Standards  ·  Albany, NY", indent=4)

    c.save()
    print(f"Onboarding guide generated: {out_path}")

if __name__ == "__main__":
    generate_guide("/mnt/user-data/outputs/Morpheus_Trainer_Onboarding_Guide.pdf")

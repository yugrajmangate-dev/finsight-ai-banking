import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import utcnow
from .utils import mask_account

NAVY = colors.HexColor("#0B2545")


def _rs(minor: int) -> str:
    return f"Rs. {minor / 100:,.2f}"


def build_pdf(user, acc, txns, start, end) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm,
                            bottomMargin=15 * mm, title="Account Statement")
    ss = getSampleStyleSheet()
    credits = sum(t.amount_minor for t in txns if t.type in ("deposit", "transfer_in", "loan_disbursement"))
    debits = sum(t.amount_minor for t in txns if t.type in ("withdrawal", "transfer_out"))
    opening = (txns[0].balance_after_minor + (txns[0].amount_minor if txns[0].type in ("withdrawal", "transfer_out")
               else -txns[0].amount_minor)) if txns else acc.balance_minor
    closing = txns[-1].balance_after_minor if txns else acc.balance_minor

    story = [
        Paragraph("<font color='#0B2545' size=18><b>FinSight Bank</b></font>", ss["Title"]),
        Paragraph("Account Statement — simulated demo bank (educational project)", ss["Normal"]),
        Spacer(1, 6 * mm),
    ]
    info = Table([
        ["Account holder", user.full_name, "Statement period", f"{start:%d %b %Y} – {end:%d %b %Y}"],
        ["Account", mask_account(acc.account_number), "Account type", acc.type.title()],
        ["Opening balance", _rs(opening), "Closing balance", _rs(closing)],
        ["Total credits", _rs(credits), "Total debits", _rs(debits)],
    ], colWidths=[32 * mm, 55 * mm, 35 * mm, 58 * mm])
    info.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("TEXTCOLOR", (0, 0), (0, -1), colors.grey),
                              ("TEXTCOLOR", (2, 0), (2, -1), colors.grey),
                              ("BOX", (0, 0), (-1, -1), 0.5, colors.lightgrey),
                              ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F5F7FA"))]))
    story += [info, Spacer(1, 6 * mm)]

    rows = [["Date", "Reference", "Description", "Debit", "Credit", "Balance"]]
    for t in txns:
        debit = t.type in ("withdrawal", "transfer_out")
        rows.append([t.created_at.strftime("%d-%m-%Y"), t.reference, Paragraph(t.description[:60], ss["BodyText"]),
                     _rs(t.amount_minor) if debit else "", "" if debit else _rs(t.amount_minor),
                     _rs(t.balance_after_minor)])
    if len(rows) == 1:
        rows.append(["", "", "No transactions in this period", "", "", ""])
    table = Table(rows, colWidths=[20 * mm, 32 * mm, 58 * mm, 24 * mm, 24 * mm, 24 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5), ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F7FA")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.lightgrey),
    ]))
    story += [table, Spacer(1, 6 * mm),
              Paragraph(f"<font size=7 color='grey'>Generated {utcnow():%d %b %Y %H:%M} UTC. This statement is from a "
                        "simulated banking system built for academic demonstration and has no financial validity.</font>",
                        ss["Normal"])]
    doc.build(story)
    return buf.getvalue()

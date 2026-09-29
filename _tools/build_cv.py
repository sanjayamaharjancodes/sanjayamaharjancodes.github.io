"""Build assets/cv.pdf from the same facts the site states.

    python _tools/build_cv.py

Every line here mirrors copy on the site (index.html) or the original CV; nothing is added
that the site does not also say. No phone numbers, by design.
"""
import pathlib

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUT = pathlib.Path(__file__).resolve().parents[1] / "assets" / "cv.pdf"
INK = colors.HexColor("#1c1915")
MUTED = colors.HexColor("#5f564a")
ACCENT = colors.HexColor("#9c4119")
W = 7.1 * inch - 12  # frame width minus the frame's own 6pt side padding
RULE = colors.HexColor("#d5ccb8")

base = dict(fontName="Helvetica", fontSize=9.3, leading=12.2, textColor=INK, alignment=TA_LEFT)
S = {
    "name": ParagraphStyle("name", **{**base, "fontName": "Helvetica-Bold", "fontSize": 22, "leading": 25}),
    "title": ParagraphStyle("title", **{**base, "fontSize": 11.5, "leading": 15, "textColor": ACCENT}),
    "contact": ParagraphStyle("contact", **{**base, "fontSize": 8.4, "leading": 11, "textColor": MUTED}),
    "h": ParagraphStyle("h", **{**base, "fontName": "Helvetica-Bold", "fontSize": 9.2, "leading": 12, "textColor": ACCENT, "spaceBefore": 9, "spaceAfter": 3}),
    "role": ParagraphStyle("role", **{**base, "fontName": "Helvetica-Bold", "fontSize": 9.7, "leading": 12.6}),
    "meta": ParagraphStyle("meta", **{**base, "fontSize": 8.3, "leading": 10.6, "textColor": MUTED}),
    "date": ParagraphStyle("date", **{**base, "fontSize": 8.3, "leading": 10.6, "textColor": MUTED, "alignment": TA_RIGHT}),
    "body": ParagraphStyle("body", **base),
    "bullet": ParagraphStyle("bullet", **{**base, "leftIndent": 10, "bulletIndent": 0, "spaceBefore": 0.6}),
}


def h(text):
    return [Paragraph(text.upper(), S["h"]), rule()]


def rule():
    t = Table([[""]], colWidths=[W], rowHeights=[0.5])
    t.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, -1), 0.6, RULE), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    return t


def bullets(items):
    return [Paragraph(x, S["bullet"], bulletText="•") for x in items]


def role(title, org, when, items):
    head = Table([[Paragraph(f"{title} — {org}", S["role"]), Paragraph(when, S["date"])]], colWidths=[W - 1.2 * inch, 1.2 * inch])
    head.setStyle(TableStyle([("ALIGN", (1, 0), (1, 0), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                              ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    return KeepTogether([head] + bullets(items))


story = [
    Paragraph("Sanjaya Maharjan", S["name"]),
    Paragraph("AI &amp; Cloud Architect", S["title"]),
    Paragraph("Kathmandu, Nepal (UTC+5:45) · open to relocation and remote · smaharjan.codes@gmail.com<br/>"
              "linkedin.com/in/sanjaya-maharjan · github.com/sanjayamaharjancodes · sanjayamaharjancodes.github.io", S["contact"]),
    Spacer(1, 4),
    *h("Summary"),
    Paragraph("AI and cloud architect with 14 years of shipping production software since 2012. I build AI agents and LLM applications — "
              "including an agentic corporate-footprint mapper for Monotype — on the cloud foundations I have delivered for Monotype, HP, "
              "Deloitte and the State of Colorado: .NET microservices and secure APIs, React and Angular front-ends, and AWS infrastructure "
              "defined in Terraform. I own the architecture, write the code, and stay for production.", S["body"]),

    *h("AI &amp; ML work"),
    *bullets([
        "<b>Corporate Footprint Mapper</b> (built for Monotype, private): an agentic tool that maps a company's legal entities from the "
        "ultimate parent to the nth subsidiary and attaches each entity's brands, websites, apps and digital assets, with web scraping built in.",
        "<b>Agent organization</b> (R&amp;D, private): role-separated agents on Claude Code — CEO, Strategist, Researcher, Builder, Reviewer, "
        "Growth, Comms, Legal and Investor. Cited-source rule, a Reviewer that can block any plan, auditable memory in files and git, "
        "scheduled cloud runs. 606 commits and 145 reviews over 89 active days (counted September 2026).",
        "<b>ML in client work:</b> ML-driven font impression and emotion analysis for Fontworks' LETS and Monotype's Research 360.",
        "<b>Open source:</b> Fake-Image-Detector — hybrid ML and analytical image forensics (sensor noise, FFT/DCT spectra, resampling, "
        "lighting physics) with ONNX inference, a model registry and drift detection; scrape-diagnose — a CLI that explains scraper 403/429/empty-HTML "
        "failures; json-typed-code — a VS Code extension that turns JSON into TypeScript, Python, Go or Rust types.",
        "<b>R&amp;D:</b> IncidentAtlas (reliability agent with CockroachDB vector-indexed memory, CockroachDB × AWS agentic-memory challenge); "
        "H-VF Engine (VAE-generated variable fonts with CNN scoring); Disaster Damage Assessment (UNet and Siamese change detection, Grad-CAM); "
        "D-CAT (reinforcement-learning adaptive typography); air-quality and public-health forecasting (Prophet, SARIMA, LSTM, SEIR); "
        "IntelligentResume (Llama 3.1 via Ollama with guardrails); Trace the Ace (DrivenData transcript classifier).",
    ]),

    *h("Experience"),
    role("Lead Software Engineer", "UBA Solutions (Monotype partner), Kathmandu", "2024 – Present", [
        "Own architecture for Research 360 — raw font metadata turned into a structured analysis and licensing platform.",
        "Scalable deployment strategies for high-traffic font services (LETS, Fontplus); better reliability and release safety.",
        "ML-driven font impression and emotion analysis; full-stack .NET, React and AWS; loading and data-throughput optimizations.",
        "Cloudflare edge and bot protection; monitoring and alerting.",
    ]),
    role("Senior Software Engineer", "HP Inc., Texas", "2024 – 2025", [
        "Owned microservices design and AWS delivery (ECS, RDS, Lambda, VPC) for the HP Workforce Experience Platform.",
        "Secure REST APIs documented with OpenAPI/Swagger; OAuth/JWT and secrets management; Terraform and Azure DevOps CI/CD.",
        "React performance: lazy loading, route preloading and reusable TypeScript components; performance and observability.",
    ]),
    role("Senior Software Engineer", "Deloitte, Colorado", "2023 – 2024", [
        "Led API platform delivery for the State of Colorado's unemployment insurance platform: OAuth and API-key security, traffic management, analytics.",
        "Workflow microservices and API Gateway integration with the IBM content engine on .NET Core; SQS-backed async workloads; Redis caching.",
        "Document and profile management in Angular 18 and React; SSO and high availability; Azure DevOps CI/CD.",
    ]),
    role("Senior Software Engineer", "Dwaith Infotech, Minnesota (remote)", "May – Sep 2023", [
        "Modernized a legacy architecture onto .NET microservices handling 1M+ requests a day; React and Redux with TypeScript UI patterns.",
        "PostgreSQL, MySQL, MongoDB and DynamoDB; AWS and Azure; Docker and Kubernetes; Redis caching, async processing, monitoring.",
    ]),
    role("Solution Architect / Lead Software Engineer", "UBA Solutions (Monotype partner), Nepal", "2018 – 2023", [
        "Scaled and modernized MyFonts, Fonts.com, Linotype and FontShop on AWS — EC2 autoscaling, load balancers, RDS read replicas, S3.",
        "Migrated on-prem systems to AWS with Terraform; CI/CD with Jenkins and Octopus; improved monitoring and incident response.",
        "Security: OAuth/JWT, SSO, 3D Secure, CyberSource and Cloudflare bot protection; Docker and Kubernetes; caching and CDN.",
    ]),
    role("Lead Software Engineer", "Novelty Technology (North Carolina, Nepal office)", "2017 – 2018", [
        "Led a microservices transition and full-stack delivery (Node.js, Angular, RxJS, ASP.NET Core) for CollegeRecon and Alithias healthcare analytics.",
    ]),
    role("Senior Software Engineer", "Grafi Offshore, Nepal", "2014 – 2016", [
        "Owned infrastructure and software design; PayPal and Adyen integrations for Leslinq.com, a Japanese tobacco inventory system and Banaunu.com.",
    ]),
    role("Software Engineer", "Hatra Inc. and Channakya Software, Nepal", "2012 – 2014", [
        "C#, ASP.NET, Web API, Entity Framework and MSSQL: a financial risk-management assistant, a Bank of Canada survey platform and the Subisu inventory system.",
    ]),

    *h("Skills"),
    *bullets([
        "<b>AI &amp; ML:</b> LLM apps and RAG, agents and tool use, vector search and agent memory, scraping and entity mapping, AWS Bedrock and SageMaker, "
        "Azure OpenAI, OpenAI and Anthropic APIs, ONNX and drift detection, Ollama and Hugging Face, spaCy, UNet/Siamese/VAE, Prophet/SARIMA/LSTM.",
        "<b>Backend:</b> C#, .NET and ASP.NET Core, Web API, REST and OpenAPI, Entity Framework and LINQ, Node.js and NestJS, Python and FastAPI.",
        "<b>Frontend:</b> React, Angular, Next.js, TypeScript, RxJS, Redux.",
        "<b>Cloud &amp; DevOps:</b> AWS (ECS/ECR, EC2, Lambda, RDS, S3, VPC, SQS, CloudWatch, Route 53), Terraform, Docker, Kubernetes, Jenkins, Octopus, Azure DevOps, Cloudflare.",
        "<b>Data:</b> SQL Server, PostgreSQL, MySQL, MongoDB, DynamoDB, Redis.",
    ]),

    *h("Education &amp; certification"),
    *bullets([
        "AWS Certified Developer — Associate (Amazon Web Services)",
        "Master's in Computer Science — Nepal College of Information and Technology",
        "Bachelor's in Computer Engineering — Khwopa Engineering College, Nepal",
    ]),
]


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(0.7 * inch, 0.45 * inch, "Sanjaya Maharjan — AI & Cloud Architect · sanjayamaharjancodes.github.io")
    canvas.drawRightString(LETTER[0] - 0.7 * inch, 0.45 * inch, f"Page {doc.page}")
    canvas.restoreState()


doc = SimpleDocTemplate(str(OUT), pagesize=LETTER, leftMargin=0.7 * inch, rightMargin=0.7 * inch, topMargin=0.6 * inch, bottomMargin=0.7 * inch,
                        title="Sanjaya Maharjan — AI & Cloud Architect", author="Sanjaya Maharjan", subject="CV",
                        pageCompression=1)
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("wrote", OUT)

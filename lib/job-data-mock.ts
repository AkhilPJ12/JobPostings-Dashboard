export type Job = {
  id: string
  externalJobId: string
  title: string
  company: string
  companyColor: string
  companyIcon: string | null
  location: string
  locationType: "Remote" | "Hybrid" | "Onsite"
  department: string
  type: "Full-time" | "Part-time" | "Contract" | "Internship"
  postedDate: string | null
  endDate: string | null
  description: string
  securityClearance: "Yes" | "No" | "N/A"
  visaSponsorship: "Yes" | "No" | "N/A"
  summary: string
  requiredQualifications: string[]
  preferredQualifications: string[]
  payRange: string
  jobUrl: string
}

const companies = [
  { name: "Vercel", color: "hsl(0, 0%, 10%)" },
  { name: "Stripe", color: "hsl(258, 70%, 54%)" },
  { name: "Figma", color: "hsl(14, 89%, 55%)" },
  { name: "Notion", color: "hsl(0, 0%, 20%)" },
  { name: "Linear", color: "hsl(250, 80%, 60%)" },
  { name: "Supabase", color: "hsl(153, 60%, 45%)" },
  { name: "Shopify", color: "hsl(131, 51%, 39%)" },
  { name: "Datadog", color: "hsl(268, 60%, 50%)" },
  { name: "Cloudflare", color: "hsl(25, 95%, 53%)" },
  { name: "Plaid", color: "hsl(0, 0%, 15%)" },
]

const departments = [
  "Engineering",
  "Product",
  "Design",
  "Sales",
  "Marketing",
  "Operations",
  "Data Science",
  "DevOps",
]

const locations = [
  { city: "San Francisco, CA", type: "Onsite" as const },
  { city: "New York, NY", type: "Onsite" as const },
  { city: "London, UK", type: "Onsite" as const },
  { city: "Remote", type: "Remote" as const },
  { city: "Austin, TX", type: "Hybrid" as const },
  { city: "Seattle, WA", type: "Hybrid" as const },
  { city: "Remote", type: "Remote" as const },
  { city: "Berlin, DE", type: "Onsite" as const },
  { city: "Toronto, CA", type: "Hybrid" as const },
  { city: "Remote", type: "Remote" as const },
]

const jobTitles: Record<string, string[]> = {
  Engineering: [
    "Senior Frontend Engineer",
    "Backend Engineer",
    "Staff Software Engineer",
    "Full Stack Developer",
    "Platform Engineer",
    "Mobile Engineer",
    "Senior Systems Engineer",
    "Infrastructure Engineer",
  ],
  Product: [
    "Senior Product Manager",
    "Product Manager",
    "Technical Product Manager",
    "Group Product Manager",
  ],
  Design: [
    "Senior Product Designer",
    "UX Designer",
    "Design Systems Lead",
    "Visual Designer",
  ],
  Sales: [
    "Account Executive",
    "Sales Development Representative",
    "Enterprise Sales Manager",
    "Solutions Engineer",
  ],
  Marketing: [
    "Content Marketing Manager",
    "Growth Marketing Lead",
    "Developer Advocate",
    "Brand Designer",
  ],
  Operations: [
    "People Operations Manager",
    "Finance Manager",
    "Office Manager",
    "Legal Counsel",
  ],
  "Data Science": [
    "Senior Data Scientist",
    "Machine Learning Engineer",
    "Analytics Engineer",
    "Data Engineer",
  ],
  DevOps: [
    "Site Reliability Engineer",
    "DevOps Engineer",
    "Cloud Architect",
    "Security Engineer",
  ],
}

const descriptions: Record<string, string[]> = {
  Engineering: [
    "Join our engineering team to build scalable, performant systems that power millions of developers worldwide. You'll work with cutting-edge technologies and collaborate with a world-class team.",
    "We're looking for a passionate engineer to help us build the future of web development. You'll design and implement features used by top companies around the globe.",
    "Help us push the boundaries of what's possible on the web. You'll work on core infrastructure, optimize performance, and ship features that delight developers.",
    "Build robust APIs and services that form the backbone of our platform. Work with modern stacks and contribute to open-source tools used by millions.",
  ],
  Product: [
    "Drive the product vision and strategy for a key product area. You'll work closely with engineering and design to define and deliver features that users love.",
    "Shape the future of our product by identifying opportunities, defining requirements, and working cross-functionally to deliver exceptional user experiences.",
  ],
  Design: [
    "Craft beautiful and intuitive user experiences that set the standard in the industry. Collaborate with product and engineering to bring designs to life.",
    "Help define and evolve our design system, creating components and patterns that ensure consistency and quality across all our products.",
  ],
  Sales: [
    "Help grow our customer base by building relationships with engineering leaders at top companies. Drive revenue and expand our market presence.",
    "Be the technical bridge between our product and enterprise customers. Help teams understand the value of our platform and guide them to success.",
  ],
  Marketing: [
    "Create compelling content that educates and inspires our developer community. Write blog posts, create tutorials, and tell stories that resonate.",
    "Lead our growth initiatives, experimenting with channels and strategies to reach more developers and increase adoption of our platform.",
  ],
  Operations: [
    "Build and scale our people programs to support a rapidly growing, distributed team. Create culture initiatives that keep our team engaged and productive.",
    "Manage financial planning, reporting, and analysis to support strategic decision-making across the organization.",
  ],
  "Data Science": [
    "Apply machine learning and statistical methods to solve complex problems and drive product decisions. Work with large-scale data sets to uncover insights.",
    "Build and maintain data pipelines and analytics infrastructure that power business intelligence across the organization.",
  ],
  DevOps: [
    "Ensure the reliability and performance of our production systems. Design and implement monitoring, alerting, and incident response processes.",
    "Design and manage cloud infrastructure that scales to handle millions of requests. Automate deployments and optimize costs.",
  ],
}

const types: Job["type"][] = ["Full-time", "Full-time", "Full-time", "Full-time", "Contract", "Part-time", "Internship"]

const summaries: Record<string, string> = {
  Engineering: "We are seeking a talented engineer to join our growing team. In this role, you will design, build, and maintain high-quality software solutions that power our platform. You will collaborate closely with cross-functional teams to deliver features that impact millions of users. This is an opportunity to work with modern technology stacks in a fast-paced, innovative environment.",
  Product: "We are looking for a strategic product leader to drive the vision and roadmap for a key product area. You will work at the intersection of technology, design, and business to identify customer needs and deliver solutions that create real value. This role requires strong analytical skills, empathy for users, and the ability to align stakeholders around a shared vision.",
  Design: "We are looking for a creative and detail-oriented designer to shape the user experience across our products. You will partner with product managers and engineers to translate complex workflows into intuitive, beautiful interfaces. This role offers the opportunity to work on design systems, user research, and visual design at scale.",
  Sales: "We are hiring an experienced sales professional to help us grow our customer base and revenue. You will own the full sales cycle from prospecting to close, building relationships with decision-makers at target companies. This is a high-impact role with excellent earning potential and the chance to sell a product that customers love.",
  Marketing: "We are seeking a creative marketer to amplify our brand and drive awareness among our target audience. You will develop and execute campaigns across multiple channels, experiment with new strategies, and measure the impact of your work. This role is ideal for someone who combines creativity with a data-driven mindset.",
  Operations: "We are hiring an operations leader to help scale our internal processes and support our growing team. You will design workflows, improve efficiency, and build programs that foster a great workplace culture. This role requires strong organizational skills, empathy, and the ability to manage multiple priorities in a fast-moving environment.",
  "Data Science": "We are looking for a data professional to extract insights from our rich datasets and drive informed decision-making across the organization. You will build models, design experiments, and create dashboards that help teams understand user behavior and product performance. This role combines technical rigor with business acumen.",
  DevOps: "We are seeking a reliability-focused engineer to ensure our systems are performant, resilient, and scalable. You will design infrastructure, automate deployments, implement monitoring, and respond to incidents. This role is critical to maintaining the trust our customers place in our platform.",
}

const requiredQuals: Record<string, string[]> = {
  Engineering: [
    "3+ years of professional software development experience",
    "Strong proficiency in at least one modern programming language (TypeScript, Go, Python, or Rust)",
    "Experience building and deploying production web applications",
    "Solid understanding of data structures, algorithms, and system design",
    "Excellent communication and collaboration skills",
  ],
  Product: [
    "3+ years of product management experience in a technology company",
    "Demonstrated ability to define product strategy and ship features end-to-end",
    "Strong analytical skills with experience using data to inform decisions",
    "Excellent written and verbal communication skills",
    "Ability to work cross-functionally with engineering, design, and leadership",
  ],
  Design: [
    "3+ years of product design experience with a strong portfolio",
    "Proficiency in Figma and modern design tools",
    "Experience designing for web and mobile platforms",
    "Understanding of accessibility standards and responsive design principles",
    "Ability to conduct and synthesize user research",
  ],
  Sales: [
    "2+ years of B2B SaaS sales experience",
    "Proven track record of meeting or exceeding quota",
    "Experience with CRM tools (Salesforce, HubSpot, or similar)",
    "Strong presentation and negotiation skills",
    "Self-motivated with excellent time management abilities",
  ],
  Marketing: [
    "3+ years of marketing experience, preferably in tech or developer tools",
    "Experience with content creation, SEO, and multi-channel campaigns",
    "Strong writing and storytelling abilities",
    "Familiarity with marketing analytics tools and A/B testing",
    "Ability to work independently and manage multiple projects",
  ],
  Operations: [
    "3+ years of experience in operations, people ops, or finance",
    "Strong project management and organizational skills",
    "Experience with HRIS, financial systems, or workflow automation tools",
    "Excellent interpersonal and communication skills",
    "Ability to handle sensitive information with discretion",
  ],
  "Data Science": [
    "3+ years of experience in data science, analytics, or machine learning",
    "Proficiency in SQL and Python (pandas, scikit-learn, or similar)",
    "Experience with data visualization tools (Looker, Tableau, or similar)",
    "Strong statistical foundations and experiment design knowledge",
    "Ability to communicate findings to non-technical stakeholders",
  ],
  DevOps: [
    "3+ years of experience in DevOps, SRE, or infrastructure engineering",
    "Proficiency with cloud platforms (AWS, GCP, or Azure)",
    "Experience with containerization (Docker, Kubernetes)",
    "Strong knowledge of CI/CD pipelines and infrastructure as code (Terraform, Pulumi)",
    "Excellent troubleshooting and incident response skills",
  ],
}

const preferredQuals: Record<string, string[]> = {
  Engineering: [
    "Experience with Next.js, React, or similar frameworks",
    "Contributions to open-source projects",
    "Experience with distributed systems or microservices architecture",
    "Familiarity with cloud infrastructure (AWS, GCP, or Vercel)",
  ],
  Product: [
    "Technical background or experience working closely with engineers",
    "Experience with developer tools or platform products",
    "MBA or equivalent business experience",
    "Experience with agile methodologies and product analytics tools",
  ],
  Design: [
    "Experience building or contributing to a design system",
    "Familiarity with frontend development (HTML, CSS, React)",
    "Experience with motion design or prototyping tools",
    "Background in designing developer tools or technical products",
  ],
  Sales: [
    "Experience selling developer tools or infrastructure products",
    "Technical background or ability to understand APIs and developer workflows",
    "Experience in enterprise or mid-market sales",
    "Familiarity with product-led growth motions",
  ],
  Marketing: [
    "Experience marketing to developer audiences",
    "Background in developer relations or community building",
    "Video production or podcast experience",
    "Familiarity with social media advertising platforms",
  ],
  Operations: [
    "Experience in a high-growth startup environment",
    "Certification in project management (PMP) or HR (SHRM)",
    "Experience with remote or distributed team operations",
    "Background in diversity, equity, and inclusion initiatives",
  ],
  "Data Science": [
    "Experience with deep learning frameworks (PyTorch, TensorFlow)",
    "Familiarity with real-time data processing (Kafka, Spark)",
    "Published research or conference presentations",
    "Experience with A/B testing at scale",
  ],
  DevOps: [
    "Experience with edge computing or CDN architecture",
    "Knowledge of security best practices and compliance frameworks",
    "Experience with serverless architectures",
    "Familiarity with observability tools (Datadog, Grafana, PagerDuty)",
  ],
}

const payRanges: Record<string, string[]> = {
  Engineering: ["$150,000 - $210,000", "$130,000 - $190,000", "$180,000 - $250,000", "$120,000 - $170,000"],
  Product: ["$140,000 - $200,000", "$120,000 - $175,000", "$160,000 - $220,000", "$130,000 - $185,000"],
  Design: ["$130,000 - $185,000", "$110,000 - $160,000", "$150,000 - $210,000", "$100,000 - $145,000"],
  Sales: ["$90,000 - $130,000 + commission", "$70,000 - $100,000 + commission", "$120,000 - $160,000 + commission", "$60,000 - $85,000 + commission"],
  Marketing: ["$120,000 - $170,000", "$100,000 - $150,000", "$130,000 - $180,000", "$90,000 - $135,000"],
  Operations: ["$110,000 - $160,000", "$100,000 - $145,000", "$120,000 - $170,000", "$90,000 - $130,000"],
  "Data Science": ["$150,000 - $220,000", "$130,000 - $195,000", "$160,000 - $230,000", "$120,000 - $180,000"],
  DevOps: ["$140,000 - $200,000", "$125,000 - $185,000", "$155,000 - $220,000", "$115,000 - $170,000"],
}

function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().split('T')[0]
}

export const jobs: Job[] = [
  { id: "1", externalJobId: "mock_1", title: "Senior Frontend Engineer", company: "Vercel", companyColor: companies[0].color, companyIcon: null, location: "Remote", locationType: "Remote", department: "Engineering", type: "Full-time", postedDate: daysAgo(0), endDate: null, description: descriptions.Engineering[0], securityClearance: "No", visaSponsorship: "Yes", summary: summaries.Engineering, requiredQualifications: requiredQuals.Engineering, preferredQualifications: preferredQuals.Engineering, payRange: payRanges.Engineering[0], jobUrl: "https://example.com/jobs/mock" },
  { id: "2", externalJobId: "mock_2", title: "Backend Engineer", company: "Stripe", companyColor: companies[1].color, companyIcon: null, location: "San Francisco, CA", locationType: "Onsite", department: "Engineering", type: "Full-time", postedDate: daysAgo(1), endDate: null, description: descriptions.Engineering[1], securityClearance: "No", visaSponsorship: "Yes", summary: summaries.Engineering, requiredQualifications: requiredQuals.Engineering, preferredQualifications: preferredQuals.Engineering, payRange: payRanges.Engineering[1], jobUrl: "https://example.com/jobs/mock" },
  { id: "3", externalJobId: "mock_3", title: "Senior Product Designer", company: "Figma", companyColor: companies[2].color, companyIcon: null, location: "New York, NY", locationType: "Hybrid", department: "Design", type: "Full-time", postedDate: daysAgo(1), endDate: null, description: descriptions.Design[0], securityClearance: "No", visaSponsorship: "Yes", summary: summaries.Design, requiredQualifications: requiredQuals.Design, preferredQualifications: preferredQuals.Design, payRange: payRanges.Design[0], jobUrl: "https://example.com/jobs/mock" },
  { id: "4", externalJobId: "mock_4", title: "Senior Product Manager", company: "Notion", companyColor: companies[3].color, companyIcon: null, location: "San Francisco, CA", locationType: "Onsite", department: "Product", type: "Full-time", postedDate: daysAgo(2), endDate: null, description: descriptions.Product[0], securityClearance: "No", visaSponsorship: "No", summary: summaries.Product, requiredQualifications: requiredQuals.Product, preferredQualifications: preferredQuals.Product, payRange: payRanges.Product[0], jobUrl: "https://example.com/jobs/mock" },
  { id: "5", externalJobId: "mock_5", title: "Staff Software Engineer", company: "Linear", companyColor: companies[4].color, companyIcon: null, location: "Remote", locationType: "Remote", department: "Engineering", type: "Full-time", postedDate: daysAgo(2), endDate: null, description: descriptions.Engineering[2], securityClearance: "No", visaSponsorship: "Yes", summary: summaries.Engineering, requiredQualifications: requiredQuals.Engineering, preferredQualifications: preferredQuals.Engineering, payRange: payRanges.Engineering[2], jobUrl: "https://example.com/jobs/mock" },
  { id: "6", externalJobId: "mock_6", title: "Developer Advocate", company: "Supabase", companyColor: companies[5].color, companyIcon: null, location: "Remote", locationType: "Remote", department: "Marketing", type: "Full-time", postedDate: daysAgo(3), endDate: null, description: descriptions.Marketing[0], securityClearance: "N/A", visaSponsorship: "N/A", summary: summaries.Marketing, requiredQualifications: requiredQuals.Marketing, preferredQualifications: preferredQuals.Marketing, payRange: payRanges.Marketing[0], jobUrl: "https://example.com/jobs/mock" },
  { id: "7", externalJobId: "mock_7", title: "Machine Learning Engineer", company: "Datadog", companyColor: companies[7].color, companyIcon: null, location: "New York, NY", locationType: "Onsite", department: "Data Science", type: "Full-time", postedDate: daysAgo(3), description: descriptions["Data Science"][0], securityClearance: "No", visaSponsorship: "Yes", summary: summaries["Data Science"], requiredQualifications: requiredQuals["Data Science"], preferredQualifications: preferredQuals["Data Science"], payRange: payRanges["Data Science"][0], jobUrl: "https://example.com/jobs/mock" },
  { id: "8", externalJobId: "mock_8", title: "Full Stack Developer", company: "Shopify", companyColor: companies[6].color, companyIcon: null, location: "Toronto, CA", locationType: "Hybrid", department: "Engineering", type: "Full-time", postedDate: daysAgo(4), endDate: null, description: descriptions.Engineering[3], securityClearance: "No", visaSponsorship: "No", summary: summaries.Engineering, requiredQualifications: requiredQuals.Engineering, preferredQualifications: preferredQuals.Engineering, payRange: payRanges.Engineering[3], jobUrl: "https://example.com/jobs/mock" },
  { id: "9", externalJobId: "mock_9", title: "Site Reliability Engineer", company: "Cloudflare", companyColor: companies[8].color, companyIcon: null, location: "Austin, TX", locationType: "Hybrid", department: "DevOps", type: "Full-time", postedDate: daysAgo(4), endDate: null, description: descriptions.DevOps[0], securityClearance: "Yes", visaSponsorship: "No", summary: summaries.DevOps, requiredQualifications: requiredQuals.DevOps, preferredQualifications: preferredQuals.DevOps, payRange: payRanges.DevOps[0], jobUrl: "https://example.com/jobs/mock" },
  { id: "10", externalJobId: "mock_10", title: "Account Executive", company: "Plaid", companyColor: companies[9].color, companyIcon: null, location: "San Francisco, CA", locationType: "Onsite", department: "Sales", type: "Full-time", postedDate: daysAgo(5), endDate: null, description: descriptions.Sales[0], securityClearance: "No", visaSponsorship: "No", summary: summaries.Sales, requiredQualifications: requiredQuals.Sales, preferredQualifications: preferredQuals.Sales, payRange: payRanges.Sales[0], jobUrl: "https://example.com/jobs/mock" },
  { id: "11", externalJobId: "mock_11", title: "Design Systems Lead", company: "Vercel", companyColor: companies[0].color, companyIcon: null, location: "Remote", locationType: "Remote", department: "Design", type: "Full-time", postedDate: daysAgo(5), endDate: null, description: descriptions.Design[1], securityClearance: "No", visaSponsorship: "Yes", summary: summaries.Design, requiredQualifications: requiredQuals.Design, preferredQualifications: preferredQuals.Design, payRange: payRanges.Design[2], jobUrl: "https://example.com/jobs/mock" },
  { id: "12", externalJobId: "mock_12", title: "Platform Engineer", company: "Stripe", companyColor: companies[1].color, companyIcon: null, location: "Seattle, WA", locationType: "Hybrid", department: "Engineering", type: "Full-time", postedDate: daysAgo(6), endDate: null, description: descriptions.Engineering[0], securityClearance: "No", visaSponsorship: "Yes", summary: summaries.Engineering, requiredQualifications: requiredQuals.Engineering, preferredQualifications: preferredQuals.Engineering, payRange: payRanges.Engineering[0], jobUrl: "https://example.com/jobs/mock" },
  { id: "13", externalJobId: "mock_13", title: "Growth Marketing Lead", company: "Notion", companyColor: companies[3].color, companyIcon: null, location: "New York, NY", locationType: "Onsite", department: "Marketing", type: "Full-time", postedDate: daysAgo(7), endDate: null, description: descriptions.Marketing[1], securityClearance: "N/A", visaSponsorship: "No", summary: summaries.Marketing, requiredQualifications: requiredQuals.Marketing, preferredQualifications: preferredQuals.Marketing, payRange: payRanges.Marketing[1], jobUrl: "https://example.com/jobs/mock" },
  { id: "14", externalJobId: "mock_14", title: "Product Manager", company: "Figma", companyColor: companies[2].color, companyIcon: null, location: "San Francisco, CA", locationType: "Onsite", department: "Product", type: "Full-time", postedDate: daysAgo(8), endDate: null, description: descriptions.Product[1], securityClearance: "No", visaSponsorship: "Yes", summary: summaries.Product, requiredQualifications: requiredQuals.Product, preferredQualifications: preferredQuals.Product, payRange: payRanges.Product[1], jobUrl: "https://example.com/jobs/mock" },
  { id: "15", externalJobId: "mock_15", title: "Data Engineer", company: "Datadog", companyColor: companies[7].color, companyIcon: null, location: "Boston, MA", locationType: "Onsite", department: "Data Science", type: "Full-time", postedDate: daysAgo(10), description: descriptions["Data Science"][1], securityClearance: "No", visaSponsorship: "Yes", summary: summaries["Data Science"], requiredQualifications: requiredQuals["Data Science"], preferredQualifications: preferredQuals["Data Science"], payRange: payRanges["Data Science"][1], jobUrl: "https://example.com/jobs/mock" },
  { id: "16", externalJobId: "mock_16", title: "Solutions Engineer", company: "Plaid", companyColor: companies[9].color, companyIcon: null, location: "Remote", locationType: "Remote", department: "Sales", type: "Full-time", postedDate: daysAgo(11), endDate: null, description: descriptions.Sales[1], securityClearance: "No", visaSponsorship: "No", summary: summaries.Sales, requiredQualifications: requiredQuals.Sales, preferredQualifications: preferredQuals.Sales, payRange: payRanges.Sales[1], jobUrl: "https://example.com/jobs/mock" },
  { id: "17", externalJobId: "mock_17", title: "Cloud Architect", company: "Cloudflare", companyColor: companies[8].color, companyIcon: null, location: "London, UK", locationType: "Onsite", department: "DevOps", type: "Full-time", postedDate: daysAgo(12), endDate: null, description: descriptions.DevOps[1], securityClearance: "Yes", visaSponsorship: "N/A", summary: summaries.DevOps, requiredQualifications: requiredQuals.DevOps, preferredQualifications: preferredQuals.DevOps, payRange: payRanges.DevOps[1], jobUrl: "https://example.com/jobs/mock" },
  { id: "18", externalJobId: "mock_18", title: "Mobile Engineer", company: "Linear", companyColor: companies[4].color, companyIcon: null, location: "Remote", locationType: "Remote", department: "Engineering", type: "Full-time", postedDate: daysAgo(13), endDate: null, description: descriptions.Engineering[1], securityClearance: "No", visaSponsorship: "Yes", summary: summaries.Engineering, requiredQualifications: requiredQuals.Engineering, preferredQualifications: preferredQuals.Engineering, payRange: payRanges.Engineering[1], jobUrl: "https://example.com/jobs/mock" },
  { id: "19", externalJobId: "mock_19", title: "People Operations Manager", company: "Supabase", companyColor: companies[5].color, companyIcon: null, location: "Remote", locationType: "Remote", department: "Operations", type: "Full-time", postedDate: daysAgo(14), endDate: null, description: descriptions.Operations[0], securityClearance: "N/A", visaSponsorship: "N/A", summary: summaries.Operations, requiredQualifications: requiredQuals.Operations, preferredQualifications: preferredQuals.Operations, payRange: payRanges.Operations[0], jobUrl: "https://example.com/jobs/mock" },
  { id: "20", externalJobId: "mock_20", title: "UX Designer", company: "Shopify", companyColor: companies[6].color, companyIcon: null, location: "Toronto, CA", locationType: "Hybrid", department: "Design", type: "Contract", postedDate: daysAgo(15), endDate: null, description: descriptions.Design[0], securityClearance: "No", visaSponsorship: "No", summary: summaries.Design, requiredQualifications: requiredQuals.Design, preferredQualifications: preferredQuals.Design, payRange: payRanges.Design[1], jobUrl: "https://example.com/jobs/mock" },
  { id: "21", externalJobId: "mock_21", title: "Senior Systems Engineer", company: "Vercel", companyColor: companies[0].color, companyIcon: null, location: "San Francisco, CA", locationType: "Onsite", department: "Engineering", type: "Full-time", postedDate: daysAgo(16), endDate: null, description: descriptions.Engineering[2], securityClearance: "Yes", visaSponsorship: "Yes", summary: summaries.Engineering, requiredQualifications: requiredQuals.Engineering, preferredQualifications: preferredQuals.Engineering, payRange: payRanges.Engineering[2], jobUrl: "https://example.com/jobs/mock" },
  { id: "22", externalJobId: "mock_22", title: "Content Marketing Manager", company: "Stripe", companyColor: companies[1].color, companyIcon: null, location: "Remote", locationType: "Remote", department: "Marketing", type: "Full-time", postedDate: daysAgo(18), endDate: null, description: descriptions.Marketing[0], securityClearance: "N/A", visaSponsorship: "No", summary: summaries.Marketing, requiredQualifications: requiredQuals.Marketing, preferredQualifications: preferredQuals.Marketing, payRange: payRanges.Marketing[2], jobUrl: "https://example.com/jobs/mock" },
  { id: "23", externalJobId: "mock_23", title: "Technical Product Manager", company: "Linear", companyColor: companies[4].color, companyIcon: null, location: "Remote", locationType: "Remote", department: "Product", type: "Full-time", postedDate: daysAgo(20), endDate: null, description: descriptions.Product[0], securityClearance: "No", visaSponsorship: "Yes", summary: summaries.Product, requiredQualifications: requiredQuals.Product, preferredQualifications: preferredQuals.Product, payRange: payRanges.Product[2], jobUrl: "https://example.com/jobs/mock" },
  { id: "24", externalJobId: "mock_24", title: "Analytics Engineer", company: "Figma", companyColor: companies[2].color, companyIcon: null, location: "New York, NY", locationType: "Hybrid", department: "Data Science", type: "Full-time", postedDate: daysAgo(22), description: descriptions["Data Science"][1], securityClearance: "No", visaSponsorship: "Yes", summary: summaries["Data Science"], requiredQualifications: requiredQuals["Data Science"], preferredQualifications: preferredQuals["Data Science"], payRange: payRanges["Data Science"][1], jobUrl: "https://example.com/jobs/mock" },
  { id: "25", externalJobId: "mock_25", title: "Security Engineer", company: "Cloudflare", companyColor: companies[8].color, companyIcon: null, location: "Austin, TX", locationType: "Hybrid", department: "DevOps", type: "Full-time", postedDate: daysAgo(25), endDate: null, description: descriptions.DevOps[0], securityClearance: "Yes", visaSponsorship: "No", summary: summaries.DevOps, requiredQualifications: requiredQuals.DevOps, preferredQualifications: preferredQuals.DevOps, payRange: payRanges.DevOps[2], jobUrl: "https://example.com/jobs/mock" },
  { id: "26", externalJobId: "mock_26", title: "Sales Development Representative", company: "Notion", companyColor: companies[3].color, companyIcon: null, location: "San Francisco, CA", locationType: "Onsite", department: "Sales", type: "Internship", postedDate: daysAgo(26), endDate: null, description: descriptions.Sales[0], securityClearance: "No", visaSponsorship: "N/A", summary: summaries.Sales, requiredQualifications: requiredQuals.Sales, preferredQualifications: preferredQuals.Sales, payRange: payRanges.Sales[3], jobUrl: "https://example.com/jobs/mock" },
  { id: "27", externalJobId: "mock_27", title: "Infrastructure Engineer", company: "Supabase", companyColor: companies[5].color, companyIcon: null, location: "Remote", locationType: "Remote", department: "Engineering", type: "Full-time", postedDate: daysAgo(28), endDate: null, description: descriptions.Engineering[3], securityClearance: "No", visaSponsorship: "Yes", summary: summaries.Engineering, requiredQualifications: requiredQuals.Engineering, preferredQualifications: preferredQuals.Engineering, payRange: payRanges.Engineering[3], jobUrl: "https://example.com/jobs/mock" },
  { id: "28", externalJobId: "mock_28", title: "Finance Manager", company: "Shopify", companyColor: companies[6].color, companyIcon: null, location: "Toronto, CA", locationType: "Onsite", department: "Operations", type: "Full-time", postedDate: daysAgo(29), endDate: null, description: descriptions.Operations[1], securityClearance: "N/A", visaSponsorship: "No", summary: summaries.Operations, requiredQualifications: requiredQuals.Operations, preferredQualifications: preferredQuals.Operations, payRange: payRanges.Operations[1], jobUrl: "https://example.com/jobs/mock" },
  { id: "29", externalJobId: "mock_29", title: "Visual Designer", company: "Datadog", companyColor: companies[7].color, companyIcon: null, location: "New York, NY", locationType: "Onsite", department: "Design", type: "Part-time", postedDate: daysAgo(30), endDate: null, description: descriptions.Design[0], securityClearance: "No", visaSponsorship: "No", summary: summaries.Design, requiredQualifications: requiredQuals.Design, preferredQualifications: preferredQuals.Design, payRange: payRanges.Design[3], jobUrl: "https://example.com/jobs/mock" },
  { id: "30", externalJobId: "mock_30", title: "DevOps Engineer", company: "Plaid", companyColor: companies[9].color, companyIcon: null, location: "Remote", locationType: "Remote", department: "DevOps", type: "Full-time", postedDate: daysAgo(31), endDate: null, description: descriptions.DevOps[1], securityClearance: "No", visaSponsorship: "Yes", summary: summaries.DevOps, requiredQualifications: requiredQuals.DevOps, preferredQualifications: preferredQuals.DevOps, payRange: payRanges.DevOps[3], jobUrl: "https://example.com/jobs/mock" },
]

export function getUniqueCompanies(): string[] {
  return [...new Set(jobs.map((j) => j.company))].sort()
}

export function getUniqueDepartments(): string[] {
  return [...new Set(jobs.map((j) => j.department))].sort()
}

export function getUniqueLocationTypes(): string[] {
  return ["Remote", "Hybrid", "Onsite"]
}

export function getUniqueLocations(): string[] {
  return [...new Set(jobs.map((j) => j.location))].sort()
}

export function getJobCountByCompany(company: string): number {
  return jobs.filter((j) => j.company === company).length
}

export function getUniqueCompanyCount(): number {
  return new Set(jobs.map((j) => j.company)).size
}

export function getJobById(id: string): Job | undefined {
  return jobs.find((j) => j.id === id)
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A"
  const date = new Date(dateStr + 'T00:00:00')
  if (isNaN(date.getTime())) return "N/A"
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

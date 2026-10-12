"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Heart,
  Copy,
  Check,
  Mail,
  Phone,
  User,
  MessageSquare,
  Wallet,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

const cryptoAddresses = [
  {
    name: "Bitcoin (BTC)",
    address: "bc1qfaap8xuwetgv2j40hqxxhlaek7atmg5jksumu6",
    icon: "https://cdn-icons-png.flaticon.com/512/5968/5968260.png",
    color: "from-orange-500/20 to-amber-500/20 border-orange-200 dark:border-orange-800",
  },
  {
    name: "Ethereum (ETH)",
    address: "0x195F1d6a404DAcC4B5F29EBB5D1E148D3ae6c65b",
    icon: "https://cdn-icons-png.flaticon.com/512/7016/7016537.png",
    color: "from-indigo-500/20 to-purple-500/20 border-indigo-200 dark:border-indigo-800",
  },
  {
    name: "Solana (SOL)",
    address: "6zKHXrT4bHrrCHCEJkAUPGqetc5AcNnhMAKTVtvLbPB4",
    icon: "https://cdn-icons-png.flaticon.com/512/12114/12114250.png",
    color: "from-emerald-500/20 to-teal-500/20 border-emerald-200 dark:border-emerald-800",
  },
]

function CryptoCard({ name, address, icon, color }: typeof cryptoAddresses[0]) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-gradient-to-br p-5 transition-all hover:shadow-md",
        color
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <img src={icon} alt={name} className="h-8 w-8 rounded-lg bg-white p-1" />
        <h3 className="font-semibold text-foreground">{name}</h3>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg bg-background/80 px-3 py-2 text-xs font-mono text-muted-foreground">
          {address}
        </code>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 h-9 w-9"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}

export default function SupportPage() {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    message: "",
  })
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // For now, open a mailto link with the form data
    const subject = encodeURIComponent(`Support Request from ${formData.name}`)
    const body = encodeURIComponent(
      `Name: ${formData.name}\nPhone: ${formData.phone}\nEmail: ${formData.email}\n\nMessage:\n${formData.message}`
    )
    window.open(`mailto:support@jobdashboard.com?subject=${subject}&body=${body}`)
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 3000)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Jobs
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10">
            <Heart className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            Help & Support
          </h1>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
            We appreciate your support! This project is maintained independently and your
            contributions help cover development, API costs, hosting, and cloud infrastructure.
          </p>
        </div>

        {/* Donation Section */}
        <section className="mb-12">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Support the Project</h2>
          </div>

          <div className="rounded-lg border border-border bg-card p-6 mb-5">
            <p className="text-sm text-muted-foreground leading-relaxed mb-1">
              Any contribution, no matter how small, goes a long way. Your support directly funds:
            </p>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                Server & cloud hosting costs
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                API & third-party service fees
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                Ongoing development & features
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                Database & deployment costs
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                AI features & LLM API costs
              </li>
            </ul>
          </div>

          <div className="grid gap-4">
            {cryptoAddresses.map((crypto) => (
              <CryptoCard key={crypto.name} {...crypto} />
            ))}
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Thank you for keeping this project alive and free for everyone.
          </p>
        </section>

        {/* Collaboration Section */}
        <section className="mb-12">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <ExternalLink className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Open for Collaboration</h2>
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-6">
            <p className="text-sm text-muted-foreground leading-relaxed">
              I&#39;m passionate about building cool things and always open to collaborating with like-minded
              people. Whether it&#39;s this project or something entirely new &mdash; if you have an interesting
              idea or an ongoing project, I&#39;d love to hear about it and explore working together.
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span>Have a project idea? Let&#39;s brainstorm and build it together</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span>Working on something interesting? I&#39;m open to joining forces</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span>Contribute to this platform &mdash; scrapers, UI, data pipelines, or new features</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span>Open to freelance, side projects, hackathons, or long-term partnerships</span>
              </li>
            </ul>
            <p className="mt-4 text-sm text-foreground font-medium">
              Got something in mind? Drop a message below &mdash; let&#39;s build something great together.
            </p>
          </div>
        </section>

        {/* Contact Form */}
        <section>
          <div className="flex items-center gap-2.5 mb-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <MessageSquare className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Get in Touch</h2>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground mb-6">
              Have a question, feedback, or need help? Fill out the form below and we&#39;ll get back to you.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-foreground">
                    Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="Your name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-foreground">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="Your phone number"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-foreground">
                  Message
                </label>
                <textarea
                  id="message"
                  placeholder="How can we help you?"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  rows={4}
                  className="flex w-full rounded-lg border border-input bg-background px-4 py-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  required
                />
              </div>

              <Button type="submit" className="w-full gap-2" size="lg" disabled={submitted}>
                {submitted ? (
                  <>
                    <Check className="h-4 w-4" />
                    Message Sent!
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Send Message
                  </>
                )}
              </Button>
            </form>
          </div>
        </section>
      </main>
    </div>
  )
}

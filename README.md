# JobPostings-Dashboard

A modern, feature-rich job listings dashboard built with Next.js 16, React 19, TypeScript, and TailwindCSS. This application provides a beautiful, responsive interface for browsing and filtering job postings from top tech companies.

![Job Dashboard](https://img.shields.io/badge/Next.js-16.1.6-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19.2.3-blue?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-blue?style=flat-square&logo=typescript)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4.17-38B2AC?style=flat-square&logo=tailwind-css)

## ✨ Features

- **🔍 Advanced Search**: Real-time search across job titles, companies, descriptions, and departments with debounced input
- **🎯 Smart Filtering**: Filter jobs by:
  - Companies (10 top tech companies)
  - Location types (Remote, Hybrid, Onsite)
  - Departments (Engineering, Product, Design, Sales, Marketing, Operations, Data Science, DevOps)
  - Date posted (Today, Last 7 days, Last 30 days, All)
  - Employment types (Full-time, Part-time, Contract, Internship)
- **📊 Multiple Sort Options**: Sort by most recent, company name, or job title
- **📱 Responsive Design**: Fully responsive with mobile-optimized filter sidebar
- **🌓 Dark/Light Mode**: Theme toggle with system preference support
- **📄 Pagination**: Clean pagination with 12 jobs per page
- **💼 Detailed Job Views**: Individual job detail pages with comprehensive information
- **🎨 Modern UI**: Built with Radix UI components and custom styling
- **⚡ Performance**: Optimized with Next.js Turbopack for fast development

## 🏗️ Project Structure

```
JobPostings-Dashboard/
├── app/                          # Next.js app directory
│   ├── globals.css              # Global styles and CSS variables
│   ├── layout.tsx               # Root layout with theme provider
│   ├── page.tsx                 # Home page (job dashboard)
│   └── jobs/
│       └── [id]/                # Dynamic job detail pages
├── components/                   # React components
│   ├── filter-sidebar.tsx       # Filter controls sidebar
│   ├── job-card.tsx             # Individual job card component
│   ├── job-dashboard.tsx        # Main dashboard component
│   ├── job-detail-content.tsx   # Job detail page content
│   ├── job-pagination.tsx       # Pagination component
│   ├── theme-provider.tsx       # Theme context provider
│   ├── theme-toggle.tsx         # Dark/light mode toggle
│   └── ui/                      # Shadcn UI components
├── lib/                          # Utility functions and data
│   ├── job-data.ts              # Job listings data and utilities
│   └── utils.ts                 # Helper functions
├── styles/                       # Additional stylesheets
├── hooks/                        # Custom React hooks
├── next.config.mjs              # Next.js configuration
├── tailwind.config.ts           # TailwindCSS configuration
├── tsconfig.json                # TypeScript configuration
└── package.json                 # Project dependencies
```

## 🚀 Getting Started

### Prerequisites

- **Node.js**: Version 18.x or higher
- **Package Manager**: pnpm (recommended), npm, or yarn

### Installation

1. **Clone the repository** (if not already done):
   ```bash
   git clone <repository-url>
   cd JobPostings-Dashboard
   ```

2. **Install dependencies**:
   ```bash
   # Using pnpm (recommended)
   pnpm install

   # Or using npm
   npm install

   # Or using yarn
   yarn install
   ```

### Running the Development Server

Start the development server with Turbopack:

```bash
# Using pnpm
pnpm dev

# Or using npm
npm run dev

# Or using yarn
yarn dev
```

The application will be available at **[http://localhost:3000](http://localhost:3000)**

### Building for Production

```bash
# Build the application
pnpm build

# Start the production server
pnpm start
```

### Linting

```bash
pnpm lint
```

### Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

**Test Coverage:**
- ✅ Component tests for all major UI components
- ✅ Utility tests for job data functions
- ✅ Integration tests for search, filter, and pagination
- 📊 Coverage threshold: 70% (branches, functions, lines, statements)

## 🎨 Key Technologies

### Core Framework
- **Next.js 16.1.6**: React framework with App Router
- **React 19.2.3**: Latest React with improved performance
- **TypeScript 5.7.3**: Type-safe development

### UI & Styling
- **TailwindCSS 3.4.17**: Utility-first CSS framework
- **Radix UI**: Accessible component primitives
- **Lucide React**: Beautiful icon library
- **next-themes**: Theme management

### Components & Libraries
- **React Hook Form**: Form state management
- **Zod**: Schema validation
- **Recharts**: Data visualization
- **date-fns**: Date utilities
- **Sonner**: Toast notifications
- **cmdk**: Command menu component

## 📊 Data Structure

The application includes **30 sample job listings** from 10 top tech companies:
- Vercel
- Stripe
- Figma
- Notion
- Linear
- Supabase
- Shopify
- Datadog
- Cloudflare
- Plaid

Each job listing includes:
- Job title and description
- Company information with brand colors
- Location and location type
- Department and employment type
- Posted date
- Salary range
- Required and preferred qualifications
- Security clearance requirements
- H1B sponsorship information

## 🎯 Features in Detail

### Search Functionality
- Debounced search input (300ms delay)
- Searches across: title, company, description, and department
- Real-time results update

### Filter System
- Multi-select filters for companies, departments, location types, and employment types
- Date range filtering
- Active filter count badge
- Visual filter chips showing applied filters
- Clear all filters functionality

### Responsive Design
- Desktop: Sidebar navigation with filters
- Mobile: Sheet-based filter drawer
- Adaptive layouts for all screen sizes

### Theme Support
- Light and dark mode
- System preference detection
- Smooth theme transitions
- Persistent theme selection

## 🛠️ Customization

### Adding New Jobs
Edit `lib/job-data.ts` to add or modify job listings. The data structure is type-safe with TypeScript.

### Styling
- Global styles: `app/globals.css`
- Theme configuration: `tailwind.config.ts`
- CSS variables for colors and spacing

### Components
All components are modular and can be customized independently. UI components are based on Radix UI and can be found in `components/ui/`.

## 📝 Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with Turbopack |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- UI components from [Radix UI](https://www.radix-ui.com/)
- Icons from [Lucide](https://lucide.dev/)
- Styled with [TailwindCSS](https://tailwindcss.com/)
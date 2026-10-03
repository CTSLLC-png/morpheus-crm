import { Link } from 'react-router-dom'

const products = [
  { title: 'Workforce Training', text: 'AI-supported customer-experience training, practice calls, credentialing and participant progress tools for workforce programs.', href: '/login', cta: 'Staff & participant sign in' },
  { title: 'Legacy Path', text: 'Plain-language family financial education covering savings, credit, retirement, insurance, estate planning and legacy preparation.', href: 'https://legacy.morpheuscr.com/', cta: 'Explore Legacy Path', external: true },
  { title: 'Creator Studio', text: 'Morpheus-native production workspace for approved campaigns, projects, media assets and production handoffs.', href: '/login', cta: 'Open Morpheus workspace' },
]

export default function PublicHome() {
  return (
    <div style={{minHeight:'100vh',background:'#07141f',color:'#eef6f4',fontFamily:"'DM Sans',sans-serif"}}>
      <header style={{borderBottom:'1px solid #1f3945'}}>
        <div style={{maxWidth:1120,margin:'0 auto',padding:'18px 24px',display:'flex',alignItems:'center',gap:20,flexWrap:'wrap'}}>
          <Link to="/" style={{color:'#fff',textDecoration:'none',fontWeight:700,fontSize:20}}>MorpheusCR</Link>
          <span style={{color:'#8fb0b8',fontSize:13}}>by Certified Training Standards LLC</span>
          <nav aria-label="Primary" style={{marginLeft:'auto',display:'flex',gap:18,alignItems:'center',flexWrap:'wrap'}}>
            <a href="#services" style={nav}>Services</a>
            <a href="https://legacy.morpheuscr.com/" style={nav}>Legacy Path</a>
            <Link to="/verify" style={nav}>Verify credential</Link>
            <Link to="/login" style={button}>Sign in</Link>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex="-1">
        <section style={{maxWidth:1120,margin:'0 auto',padding:'86px 24px 64px'}}>
          <p style={{color:'#5DCAA5',fontWeight:700,letterSpacing:1.2,textTransform:'uppercase',fontSize:13}}>Training · education · creative operations</p>
          <h1 style={{fontSize:'clamp(42px,7vw,76px)',lineHeight:1.02,maxWidth:900,margin:'14px 0 22px'}}>Turn learning, ideas and campaigns into working outcomes.</h1>
          <p style={{fontSize:20,lineHeight:1.65,color:'#b8ccd1',maxWidth:760}}>MorpheusCR is the digital platform of Certified Training Standards LLC. It brings workforce training, family financial education and AI-assisted campaign and production workflows into one operating environment.</p>
          <div style={{display:'flex',gap:12,marginTop:30,flexWrap:'wrap'}}>
            <a href="#services" style={button}>Explore services</a>
            <Link to="/login" style={secondary}>Existing customer or staff</Link>
          </div>
        </section>
        <section id="services" style={{background:'#0b1d29',borderTop:'1px solid #1f3945',borderBottom:'1px solid #1f3945'}}>
          <div style={{maxWidth:1120,margin:'0 auto',padding:'64px 24px'}}>
            <p style={eyebrow}>Choose your path</p>
            <h2 style={{fontSize:36,margin:'8px 0 12px'}}>One platform. Clear destinations.</h2>
            <p style={{color:'#9db8bf',maxWidth:720,lineHeight:1.6}}>You do not need to understand our internal systems to get started. Choose the outcome you need.</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:18,marginTop:32}}>
              {products.map(p => <article key={p.title} style={card}><h3 style={{fontSize:23,marginTop:0}}>{p.title}</h3><p style={{color:'#a9c0c6',lineHeight:1.6,minHeight:100}}>{p.text}</p>{p.external?<a href={p.href} style={textLink}>{p.cta} →</a>:<Link to={p.href} style={textLink}>{p.cta} →</Link>}</article>)}
            </div>
          </div>
        </section>
        <section style={{maxWidth:1120,margin:'0 auto',padding:'64px 24px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:30}}>
          <div><p style={eyebrow}>Built for accountability</p><h2 style={{fontSize:32}}>Know who operates the service.</h2><p style={body}>MorpheusCR is operated by Certified Training Standards LLC. Public-facing products state their pricing, scope and limitations, while protected operational tools require authentication.</p></div>
          <div><p style={eyebrow}>Customer protections</p><h2 style={{fontSize:32}}>Policies are easy to find.</h2><p style={body}>Legacy Path includes clear education-only disclosures and published privacy, terms and refund policies. Questions can be directed to CTS before purchase.</p><div style={{display:'flex',gap:16,flexWrap:'wrap'}}><Link to="/privacy" style={textLink}>Privacy</Link><Link to="/terms" style={textLink}>Terms</Link><Link to="/refunds" style={textLink}>Refunds</Link></div></div>
        </section>
      </main>
      <footer style={{borderTop:'1px solid #1f3945',padding:'28px 24px',color:'#8faab1'}}>
        <div style={{maxWidth:1120,margin:'0 auto',display:'flex',gap:18,justifyContent:'space-between',flexWrap:'wrap'}}><span>© 2026 Certified Training Standards LLC · MorpheusCR</span><span>Albany, New York · (518) 363-1140</span></div>
      </footer>
    </div>
  )
}
const nav={color:'#b8ccd1',textDecoration:'none',fontSize:14}
const button={background:'#5DCAA5',color:'#062118',textDecoration:'none',fontWeight:700,padding:'11px 17px',borderRadius:8,display:'inline-block'}
const secondary={...button,background:'transparent',color:'#dce9e6',border:'1px solid #49636a'}
const eyebrow={color:'#5DCAA5',fontWeight:700,textTransform:'uppercase',letterSpacing:1,fontSize:13}
const card={background:'#102633',border:'1px solid #28424d',borderRadius:14,padding:26}
const textLink={color:'#6ee0b7',fontWeight:700,textDecoration:'none'}
const body={color:'#a9c0c6',lineHeight:1.7}

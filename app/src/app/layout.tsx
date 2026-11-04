import "./crewforthat-theme.css";
import ThemeToggle from "./theme-toggle";
export const metadata = { title: "Crewforthat — Find Your Next Job", robots: { index: false, follow: false } };
const initTheme = `try{var p=localStorage.getItem("cft-theme-v1")||"system";var dark=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.cftTheme=dark?"dark":"light";document.documentElement.style.colorScheme=dark?"dark":"light"}catch(e){}`;
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:initTheme}}/></head><body style={{margin:0,padding:0,minHeight:"100vh"}}>{children}<ThemeToggle/></body></html>;
}

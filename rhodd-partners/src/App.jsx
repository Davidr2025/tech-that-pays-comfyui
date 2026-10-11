import { useLenis } from "./hooks/useLenis";
import Nav from "./sections/Nav";
import Hero from "./sections/Hero";
import Statement from "./sections/Statement";
import Brands from "./sections/Brands";
import Services from "./sections/Services";
import Approach from "./sections/Approach";
import Who from "./sections/Who";
import Faq from "./sections/Faq";
import Contact from "./sections/Contact";
import Footer from "./sections/Footer";

export default function App() {
  useLenis();
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Statement />
        <Brands />
        <Services />
        <Approach />
        <Who />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </>
  );
}

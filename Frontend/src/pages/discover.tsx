import { useTranslation } from "react-i18next";
import BottomNav from "../components/BottomNav";
import "./discover.css";

const DiscoverPage = () => {
  const { t } = useTranslation();

  return (
    <div className="discover-shell">
      <main className="discover-page">
        <section className="discover-hero">
          <p className="discover-eyebrow">{t("discover.title")}</p>
          <h1>{t("discover.heading")}</h1>
          <p>{t("discover.subtitle")}</p>
        </section>

        <section className="discover-card" aria-label={t("discover.cardLabel")}>
          <span className="discover-card-mark" aria-hidden="true" />
          <div>
            <p className="discover-eyebrow">{t("discover.cardEyebrow")}</p>
            <h2>{t("discover.inDevelopment")}</h2>
            <p>{t("discover.inDevelopmentCopy")}</p>
          </div>
        </section>
      </main>
      <BottomNav />
    </div>
  );
};

export default DiscoverPage;

(ns metabase-enterprise.serialization.api-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase-enterprise.serialization.api :as api.serialization]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.models.serialization :as serdes]
   [metabase.search.core :as search]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util.compress :as u.compress]
   [metabase.util.random :as u.random]
   [toucan2.core :as t2])
  (:import
   (java.io File)
   (org.apache.commons.compress.archivers.tar TarArchiveEntry TarArchiveInputStream)
   (org.apache.commons.compress.compressors.gzip GzipCompressorInputStream)))

(set! *warn-on-reflection* true)

(defn- open-tar ^TarArchiveInputStream [f]
  (-> (io/input-stream f)
      (GzipCompressorInputStream.)
      (TarArchiveInputStream.)))

(def FILE-TYPES
  [#"([^/]+)?/$"                               :dir
   #"/settings.yaml$"                          :settings
   #"/export.log$"                             :log
   #"/collections/metabots/(.*)\.yaml$"        :metabot
   #"/collections/.*/cards/(.*)\.yaml$"        :card
   #"/collections/.*/dashboards/(.*)\.yaml$"   :dashboard
   #"/collections/.*collection/([^/]*)\.yaml$" :collection
   #"/collections/([^/]*)\.yaml$"              :collection
   #"/snippets/(.*)\.yaml"                     :snippet
   #"/databases/.*/schemas/(.*)"               :schema
   #"/databases/(.*)\.yaml"                    :database])

(defn- file-type
  "Find out entity type by file path"
  [fname]
  (some (fn [[re ftype]]
          (when-let [m (re-find re fname)]
            [ftype (when (vector? m) (second m))]))
        (partition 2 FILE-TYPES)))

(defn- log-types
  "Find out entity type by log message"
  [lines]
  (->> lines
       (keep #(second (re-find #"(?:Extracting|Loading|Storing) \{:path (\w+)" %)))
       set))

(defn- tar-file-types [f & [raw?]]
  (with-open [tar (open-tar f)]
    (cond->> (u.compress/entries tar)
      true       (mapv (fn [^TarArchiveEntry e] (file-type (.getName e))))
      (not raw?) (map first)
      (not raw?) set)))

(defn- extract-one-error [entity-id orig]
  (fn [model-name opts instance]
    (if (= (:entity_id instance) entity-id)
      (throw (ex-info "[test] deliberate error message" {:test true}))
      (orig model-name opts instance))))

(defn- sanitize-key [m k]
  (let [x (k m)]
    (if (and x (or (not (string? x)) (= 21 (count x))))
      (assoc m k "**ID**")
      m)))

(defn extract-and-sanitize-exception-map [log]
  (->> (re-find #"ERROR .* (\{.*\})(\n|$)" log)
       second
       read-string
       (walk/postwalk #(-> % (sanitize-key :id) (sanitize-key :entity_id)))))

(deftest export-test
  (testing "Serialization API export"
    (let [known-files (set (.list (io/file api.serialization/parent-dir)))]
      (testing "Should require a token with `:serialization`"
        (mt/with-premium-features #{}
          (mt/assert-has-premium-feature-error "Serialization"
                                               (mt/user-http-request :rasta :post 402 "ee/serialization/export"))))
      (mt/with-premium-features #{:serialization}
        (testing "POST /api/ee/serialization/export"
          (mt/with-empty-h2-app-db!
            (mt/with-temp [:model/Collection    coll  {:name "API Collection"}
                           :model/Dashboard     _     {:collection_id (:id coll)}
                           :model/Card          card  {:collection_id (:id coll)}
                           :model/Collection    coll2 {:name "Other Collection"}
                           :model/Card          _     {:collection_id (:id coll2)}]
              (testing "API respects parameters"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              :all_collections false :data_model false :settings true)]
                  (is (= #{:log :dir :settings}
                         (tar-file-types f)))))

              (testing "We can export just a single collection"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              :collection (:id coll) :data_model false :settings false)]
                  (is (= #{:log :dir :dashboard :card :collection}
                         (tar-file-types f)))))

              (testing "We can export two collections"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              :collection (:id coll) :collection (:id coll2)
                                              :data_model false :settings false)]
                  (is (= 2
                         (->> (tar-file-types f true)
                              (filter #(= :collection (first %)))
                              count)))))

              (testing "We can export that collection using entity id"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              ;; eid:... syntax is kept for backward compat
                                              :collection (str "eid:" (:entity_id coll)) :data_model false :settings false)]
                  (is (= #{:log :dir :dashboard :card :collection}
                         (tar-file-types f)))))

              (testing "We can export that collection using entity id"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              :collection (:entity_id coll) :data_model false :settings false)]
                  (is (= #{:log :dir :dashboard :card :collection}
                         (tar-file-types f)))))

              (testing "Default export: all-collections, data-model, settings"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {})]
                  (is (= #{:log :dir :dashboard :card :collection :settings :schema :database}
                         (tar-file-types f)))))

              (testing "On exception API returns log"
                (mt/with-dynamic-fn-redefs [serdes/extract-one (extract-one-error (:entity_id card)
                                                                                  (mt/dynamic-value serdes/extract-one))]
                  (let [res (binding [api.serialization/*additive-logging* false]
                              (mt/user-http-request :crowberto :post 500 "ee/serialization/export" {}
                                                    :collection (:id coll) :data_model false :settings false))
                        log (slurp (io/input-stream res))]
                    (testing "In logs we get an entry for the dashboard, then card, and then an error"
                      (is (= #{"Dashboard" "Card"}
                             (log-types (str/split-lines log))))
                      (is (re-find #"deliberate error message" log))
                      (is (=  {:id        "**ID**",
                               :entity_id "**ID**",
                               :model     "Card",
                               :table     :report_card
                               :cause     "[test] deliberate error message"}
                              (extract-and-sanitize-exception-map log)))))))

              (testing "You can pass specific directory name"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              :dirname "check" :all_collections false :data_model false :settings false)]
                  (is (= "check/"
                         (with-open [tar (open-tar f)]
                           (.getName ^TarArchiveEntry (first (u.compress/entries tar))))))))))))
      (testing "We've left no new files, every request is cleaned up"
        ;; if this breaks, check if you consumed every response with io/input-stream
        (is (= known-files
               (set (.list (io/file api.serialization/parent-dir)))))))))

(defn- search-result-count [model search-string]
  (:total
   (search/search
    (search/search-context
     {:current-user-id       (mt/user->id :crowberto)
      :is-superuser?         true
      :is-impersonated-user? false
      :is-sandboxed-user?    false
      :models                #{model}
      :current-user-perms    #{"/"}
      :search-string         search-string}))))

#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest export-import-test
  (testing "Serialization API e2e"
    (search.tu/with-temp-index-table
      (let [known-files (set (.list (io/file api.serialization/parent-dir)))]
        (snowplow-test/with-fake-snowplow-collector
          (mt/with-premium-features #{:serialization}
            (testing "POST /api/ee/serialization/export"
              (mt/with-temp [:model/Collection coll  {}
                             :model/Dashboard  dash  {:collection_id (:id coll), :name "thraddash"}
                             :model/Card       card  {:collection_id (:id coll), :name "frobinate", :type :model}]

                (testing "We clear the card from the search index"
                  (is (= 1 (search-result-count "dashboard" "thraddash")))
                  (is (= 1 (search-result-count "dataset" "frobinate")))
                  (search/delete! :model/Dashboard [(str (:id dash))])
                  (search/delete! :model/Card [(str (:id card))])
                  (is (= 0 (search-result-count "dashboard" "thraddash")))
                  (is (= 0 (search-result-count "dataset" "frobinate"))))

                (let [res (-> (mt/user-http-request :crowberto :post 200 "ee/serialization/export"
                                                    :collection (:id coll) :data_model false :settings false)
                              io/input-stream)
                    ;; we're going to re-use it for import, so a copy is necessary
                      ba  (#'api.serialization/ba-copy res)]
                  (testing "We get only our data and a log file in an archive"
                    (is (= 4
                           (with-open [tar (open-tar ba)]
                             (count
                              (for [^TarArchiveEntry e (u.compress/entries tar)
                                    :when              (.isFile e)]
                                (do
                                  (condp re-find (.getName e)
                                    #"/export.log$" (testing "Three lines in a log for data files"
                                                      (is (= (+ #_extract 3 #_store 3)
                                                             (count (line-seq (io/reader tar))))))
                                    nil)
                                  (.getName e))))))))

                  (testing "Snowplow export event was sent"
                    (is (=? {"event"           "serialization"
                             "direction"       "export"
                             "collection"      (str (:id coll))
                             "all_collections" false
                             "data_model"      false
                             "settings"        false
                             "field_values"    false
                             "duration_ms"     (every-pred number? pos?)
                             "count"           3
                             "error_count"     0
                             "source"          "api"
                             "secrets"         false
                             "success"         true
                             "error_message"   nil}
                            (-> (snowplow-test/pop-event-data-and-user-id!) last :data))))

                  (testing "POST /api/ee/serialization/import"
                    (t2/update! :model/Dashboard {:id (:id dash)} {:name "urquan"})
                    (t2/delete! :model/Card (:id card))

                    (let [res (mt/user-http-request :crowberto :post 200 "ee/serialization/import"
                                                    {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                                    {:file ba})]
                      (testing "We get our data items back"
                        (is (= #{"Collection" "Dashboard" "Card" "Database"}
                               (log-types (line-seq (io/reader (io/input-stream res)))))))
                      (testing "And they hit the db"
                        (is (= (:name dash) (t2/select-one-fn :name :model/Dashboard :entity_id (:entity_id dash))))
                        (is (= (:name card) (t2/select-one-fn :name :model/Card :entity_id (:entity_id card)))))
                      (testing "Snowplow import event was sent"
                        (is (=? {"event"         "serialization"
                                 "direction"     "import"
                                 "duration_ms"   pos?
                                 "source"        "api"
                                 "models"        "Card,Collection,Dashboard"
                                 "count"         3
                                 "error_count"   0
                                 "success"       true
                                 "error_message" nil}
                                (-> (snowplow-test/pop-event-data-and-user-id!) last :data)))))

                    (testing "The loaded entities are added to the search index"
                      (is (= 1 (search-result-count "dashboard" "thraddash")))
                      (is (= 0 (search-result-count "dashboard" "urquan")))
                      (is (= 1 (search-result-count "dataset" "frobinate")))))

                  (mt/with-dynamic-fn-redefs [v2.ingest/ingest-file (let [ingest-file (mt/dynamic-value #'v2.ingest/ingest-file)]
                                                                      (fn [^File file]
                                                                        (cond-> (ingest-file file)
                                                                          (str/includes? (.getName file) (:entity_id card))
                                                                          (assoc :collection_id "DoesNotExist"))))]
                    (testing "ERROR /api/ee/serialization/import"
                      (let [res (binding [api.serialization/*additive-logging* false]
                                  (mt/user-http-request :crowberto :post 500 "ee/serialization/import"
                                                        {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                                        {:file ba}))
                            log (slurp (io/input-stream res))]
                        (testing "3 header lines, then cards+database+collection, then the error"
                          (is (re-find #"Failed to read file for Collection DoesNotExist" log))
                          (is (re-find #"Cannot find file" log)) ;; underlying error
                          (is (= {:deps-chain #{[{:id "**ID**", :model "Card"}]},
                                  :error      :metabase-enterprise.serialization.v2.load/not-found,
                                  :model      "Collection",
                                  :path       [{:id "DoesNotExist", :model "Collection"}],
                                  :table      :collection}
                                 (extract-and-sanitize-exception-map log))))
                        (testing "Snowplow event about error was sent"
                          (is (=? {"success"       false
                                   "event"         "serialization"
                                   "direction"     "import"
                                   "source"        "api"
                                   "duration_ms"   int?
                                   "count"         0
                                   "error_count"   0
                                   "error_message" #"(?s)Failed to read file for Collection DoesNotExist.*"}
                                  (-> (snowplow-test/pop-event-data-and-user-id!) last :data))))))

                    (testing "Skipping errors /api/ee/serialization/import"
                      (let [res (mt/user-http-request :crowberto :post 200 "ee/serialization/import"
                                                      {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                                      {:file ba}
                                                      :continue_on_error true)
                            log (slurp (io/input-stream res))]
                        (testing "3 header lines, then card+database+coll, error, then dashboard+coll"
                          (is (= #{"Dashboard" "Card" "Database" "Collection"}
                                 (log-types (str/split-lines log))))
                          (is (re-find #"Failed to read file for Collection DoesNotExist" log)))
                        (testing "Snowplow event about error was sent"
                          (is (=? {"success"     true
                                   "event"       "serialization"
                                   "direction"   "import"
                                   "source"      "api"
                                   "duration_ms" int?
                                   "count"       2
                                   "error_count" 1
                                   "models"      "Collection,Dashboard"}
                                  (-> (snowplow-test/pop-event-data-and-user-id!) last :data))))))))

                (testing "Client error /api/ee/serialization/import"
                  (let [res (mt/user-http-request :crowberto :post 422 "ee/serialization/import"
                                                  {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                                  {:file (.getBytes "not an archive" "UTF-8")})
                        log (slurp (io/input-stream res))]
                    (is (re-find #"Cannot unpack archive" log))))

                (mt/with-dynamic-fn-redefs [serdes/extract-one (extract-one-error (:entity_id card)
                                                                                  (mt/dynamic-value serdes/extract-one))]
                  (testing "ERROR /api/ee/serialization/export"
                    (binding [api.serialization/*additive-logging* false]
                      (let [res (mt/user-http-request :crowberto :post 500 "ee/serialization/export"
                                                      :collection (:id coll) :data_model false :settings false)
                            log (slurp (io/input-stream res))]
                        (is (= {:id        "**ID**",
                                :entity_id "**ID**",
                                :model     "Card",
                                :table     :report_card
                                :cause     "[test] deliberate error message"}
                               (extract-and-sanitize-exception-map log)))))

                    (testing "Snowplow event about error was sent"
                      (is (=? {"event"           "serialization"
                               "direction"       "export"
                               "duration_ms"     pos?
                               "source"          "api"
                               "count"           0
                               "collection"      (str (:id coll))
                               "all_collections" false
                               "data_model"      false
                               "settings"        false
                               "field_values"    false
                               "secrets"         false
                               "success"         false
                               "error_message"   #"(?s)Error extracting Card \d+ .*"}
                              (-> (snowplow-test/pop-event-data-and-user-id!) last :data))))

                    (testing "Full stacktrace"
                      (binding [api.serialization/*additive-logging* false]
                        (let [res (mt/user-http-request :crowberto :post 500 "ee/serialization/export"
                                                        :collection (:id coll) :data_model false :settings false
                                                        :full_stacktrace true)
                              log (slurp (io/input-stream res))]
                          (is (< 200
                                 (count (str/split-lines log))))
                        ;; pop out the error
                          (snowplow-test/pop-event-data-and-user-id!)))))

                  (testing "Skipping errors /api/ee/serialization/export"
                    (let [res (-> (mt/user-http-request :crowberto :post 200 "ee/serialization/export"
                                                        :collection (:id coll) :data_model false :settings false
                                                        :continue_on_error true)
                                ;; consume response to remove on-disk data
                                  io/input-stream)]
                      (with-open [tar (open-tar res)]
                        (doseq [^TarArchiveEntry e (u.compress/entries tar)]
                          (condp re-find (.getName e)
                            #"/export.log$" (testing "Three lines in a log for data files"
                                              (is (= (+ #_extract 3 #_error 1 #_store 2)
                                                     (count (line-seq (io/reader tar))))))
                            nil))))
                    (testing "Snowplow export event was sent"
                      (is (=? {"event"           "serialization"
                               "direction"       "export"
                               "collection"      (str (:id coll))
                               "all_collections" false
                               "data_model"      false
                               "settings"        false
                               "field_values"    false
                               "duration_ms"     pos?
                               "count"           2
                               "error_count"     1
                               "source"          "api"
                               "secrets"         false
                               "success"         true
                               "error_message"   nil}
                              (-> (snowplow-test/pop-event-data-and-user-id!) last :data))))))

                (testing "Only admins can export/import"
                  (is (= "You don't have permissions to do that."
                         (mt/user-http-request :rasta :post 403 "ee/serialization/export")))
                  (is (= "You don't have permissions to do that."
                         (mt/user-http-request :rasta :post 403 "ee/serialization/import"
                                               {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                               {:file (byte-array 0)}))))))))

        (testing "We've left no new files, every request is cleaned up"
         ;; if this breaks, check if you consumed every response with io/input-stream. Or `future` is taking too long
         ;; in `api/on-response!`, so maybe add some Thread/sleep here.
          (is (= known-files
                 (set (.list (io/file api.serialization/parent-dir))))))))))

(deftest find-serialization-dir-test
  (testing "We are able to find serialization dir even in presence of various hidden dirs"
    (let [dst (io/file api.serialization/parent-dir (u.random/random-name))]
      (.mkdirs (io/file dst "._hidden_dir"))
      (.mkdirs (io/file dst "not_hidden_dir"))
      (is (= nil
             (#'api.serialization/find-serialization-dir dst)))
      (.mkdirs (io/file dst "real_dir" "collections"))
      (is (= "real_dir"
             (.getName ^File (#'api.serialization/find-serialization-dir dst))))
      (run! io/delete-file (reverse (file-seq dst))))))

(ns metabase.query-processor.card-test
  "There are more e2e tests in [[metabase.queries.api.card-test]]."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.middleware.results-metadata :as qp.results-metadata]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(defn run-query-for-card
  "Run query for Card synchronously."
  [card-id]
  ;; TODO -- we shouldn't do the perms checks if there is no current User context. It seems like API-level perms check
  ;; stuff doesn't belong in the Dashboard QP namespace
  (mt/as-admin
    (qp.card/process-query-for-card
     card-id :api
     :make-run (constantly
                (fn [query info]
                  (qp/process-query (assoc query :info info)))))))

(defn field-filter-query
  "A query with a Field Filter parameter"
  []
  {:database (mt/id)
   :type     :native
   :native   {:template-tags {"date" {:id           "_DATE_"
                                      :name         "date"
                                      :display-name "Check-In Date"
                                      :type         :dimension
                                      :dimension    [:field (mt/id :checkins :date) nil]
                                      :widget-type  :date/all-options}}
              :query         "SELECT count(*)\nFROM CHECKINS\nWHERE {{date}}"}})

(defn non-field-filter-query
  "A query with a parameter that is not a Field Filter"
  []
  {:database (mt/id)
   :type     :native
   :native   {:template-tags {"id"
                              {:id           "_ID_"
                               :name         "id"
                               :display-name "Order ID"
                               :type         :number
                               :required     true
                               :default      "1"}}
              :query         "SELECT *\nFROM ORDERS\nWHERE id = {{id}}"}})

(defn non-parameter-template-tag-query
  "A query with template tags that aren't parameters"
  []
  (assoc (non-field-filter-query)
         "abcdef"
         {:id           "abcdef"
          :name         "#1234"
          :display-name "#1234"
          :type         :card
          :card-id      1234}

         "xyz"
         {:id           "xyz"
          :name         "snippet: My Snippet"
          :display-name "Snippet: My Snippet"
          :type         :snippet
          :snippet-name "My Snippet"
          :snippet-id   1}))

(deftest ^:parallel card-template-tag-parameters-test
  (testing "Card with a Field filter parameter"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (field-filter-query)}]
      (is (= {"date" :date/all-options}
             (#'qp.card/card-template-tag-parameters card-id))))))

(deftest ^:parallel card-template-tag-parameters-test-2
  (testing "Card with a non-Field-filter parameter"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (non-field-filter-query)}]
      (is (= {"id" :number}
             (#'qp.card/card-template-tag-parameters card-id))))))

(deftest ^:parallel card-template-tag-parameters-test-3
  (testing "Should ignore native query snippets and source card IDs"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (non-parameter-template-tag-query)}]
      (is (= {"id" :number}
             (#'qp.card/card-template-tag-parameters card-id))))))

(deftest ^:parallel infer-parameter-name-test
  (is (= "my_param"
         (#'qp.card/infer-parameter-name {:name "my_param", :target [:variable [:template-tag :category]]})))
  (is (= "category"
         (#'qp.card/infer-parameter-name {:target [:variable [:template-tag :category]]})))
  (is (= nil
         (#'qp.card/infer-parameter-name {:target [:field 1000 nil]}))))

(deftest ^:parallel validate-card-parameters-test
  (mt/with-temp [:model/Card {card-id :id} {:dataset_query (field-filter-query)}]
    (testing "Should disallow parameters that aren't actually part of the Card"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid parameter: Card [\d,]+ does not have a template tag named \"fake\""
           (#'qp.card/validate-card-parameters card-id [{:id    "_FAKE_"
                                                         :name  "fake"
                                                         :type  :date/single
                                                         :value "2016-01-01"}]))))))

(deftest ^:parallel validate-card-parameters-test-2
  (mt/with-temp [:model/Card {card-id :id} {:dataset_query (field-filter-query)}]
    (testing "Should disallow parameters that aren't actually part of the Card"
      (testing "As an API request"
        (is (=? {:message            #"Invalid parameter: Card [\d,]+ does not have a template tag named \"fake\".+"
                 :invalid-parameter  {:id "_FAKE_", :name "fake", :type "date/single", :value "2016-01-01"}
                 :allowed-parameters ["date"]}
                (mt/user-http-request :rasta :post (format "card/%d/query" card-id)
                                      {:parameters [{:id    "_FAKE_"
                                                     :name  "fake"
                                                     :type  :date/single
                                                     :value "2016-01-01"}]})))))))

(deftest ^:parallel validate-card-parameters-test-3
  (mt/with-temp [:model/Card {card-id :id} {:dataset_query (field-filter-query)}]
    (testing "Should disallow parameters with types not allowed for the widget type"
      (letfn [(validate [param-type]
                (#'qp.card/validate-card-parameters card-id [{:id    "_DATE_"
                                                              :name  "date"
                                                              :type  param-type
                                                              :value "2016-01-01"}]))]
        (testing "allowed types"
          (doseq [allowed-type #{:date/all-options :date :date/single :date/range}]
            (testing allowed-type
              (is (= nil
                     (validate allowed-type))))))
        (testing "disallowed types"
          (doseq [disallowed-type #{:number/= :category :id :string/does-not-contain}]
            (testing disallowed-type
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"Invalid parameter type :[^\s]+ for parameter \"date\".*/"
                   (validate disallowed-type)))
              (testing "should be ignored if `*allow-arbitrary-mbql-parameters*` is enabled"
                (binding [qp.card/*allow-arbitrary-mbql-parameters* true]
                  (is (= nil
                         (validate disallowed-type))))))))))))

(deftest ^:parallel validate-card-parameters-test-4
  (mt/with-temp [:model/Card {card-id :id} {:dataset_query (field-filter-query)}]
    (testing "Happy path -- API request should succeed if parameter is valid"
      (is (= [6]
             (mt/first-row (mt/user-http-request :rasta :post (format "card/%d/query" card-id)
                                                 {:parameters [{:id    "_DATE_"
                                                                :name  "date"
                                                                :type  :date/single
                                                                :value "2014-05-07"}]})))))))

(deftest ^:parallel bad-viz-settings-should-still-work-test
  (testing "We should still be able to run a query that has Card bad viz settings referencing a column not in the query (#34950)"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                              (mt/mbql-query venues
                                                {:aggregation [[:count]]})

                                              :visualization_settings
                                              {:column_settings {(json/encode
                                                                  [:ref [:field Integer/MAX_VALUE {:base-type :type/DateTime, :temporal-unit :month}]])
                                                                 {:date_abbreviate true
                                                                  :some_other_key  [:ref [:field Integer/MAX_VALUE {:base-type :type/DateTime, :temporal-unit :month}]]}}}}]
      (is (= [[100]]
             (mt/rows (run-query-for-card card-id)))))))

(deftest ^:parallel pivot-tables-should-not-override-the-run-function
  (testing "Pivot tables should not override the run function (#44160)"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                              (mt/mbql-query venues
                                                {:aggregation [[:count]]})
                                              :display :pivot}]
      (let [result (run-query-for-card card-id)]
        (is (=? {:status :completed}
                result))
        (is (= [[100]] (mt/rows result)))))))

(deftest nested-query-permissions-test
  (testing "Should be able to run a Card with another Card as its source query with just perms for the former (#15131)"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection allowed-collection    {}
                       :model/Collection disallowed-collection {}
                       :model/Card       parent-card           {:dataset_query {:database (mt/id)
                                                                                :type     :native
                                                                                :native   {:query "SELECT id FROM venues ORDER BY id ASC LIMIT 2;"}}
                                                                :database_id   (mt/id)
                                                                :collection_id (u/the-id disallowed-collection)}
                       :model/Card       child-card            {:dataset_query {:database (mt/id)
                                                                                :type     :query
                                                                                :query    {:source-table (format "card__%d" (u/the-id parent-card))}}
                                                                :collection_id (u/the-id allowed-collection)}]
          (perms/grant-collection-read-permissions! (perms-group/all-users) allowed-collection)
          (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
          (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
          (mt/with-test-user :rasta
            (letfn [(process-query-for-card [card]
                      (qp.card/process-query-for-card
                       (u/the-id card) :api
                       :make-run (constantly
                                  (fn [query info]
                                    (let [info (assoc info :query-hash (byte-array 0))]
                                      (qp/process-query (assoc query :info info)))))))]
              (testing "Should not be able to run the parent Card"
                (is (not (mi/can-read? disallowed-collection)))
                (is (not (mi/can-read? parent-card)))
                (is (thrown-with-msg?
                     clojure.lang.ExceptionInfo
                     #"\QYou don't have permissions to do that.\E"
                     (process-query-for-card parent-card))))
              (testing "Should be able to run the child Card (#15131)"
                (is (not (mi/can-read? parent-card)))
                (is (mi/can-read? allowed-collection))
                (is (mi/can-read? child-card))
                (is (= [[1] [2]]
                       (mt/rows (process-query-for-card child-card))))))))))))

(deftest ^:parallel updates-metadata-provider
  (testing "should set the previous results metadata to the store"
    (let [entity-id (u/generate-nano-id)]
      (mt/with-temp [:model/Card card {:dataset_query   (mt/native-query {:query "SELECT * FROM VENUES"})
                                       :entity_id       entity-id
                                       :result_metadata [{:name         "NAME"
                                                          :display_name "Name"
                                                          :base_type    :type/Text}]}]
        (mt/with-metadata-provider (mt/id)
          (run-query-for-card (u/the-id card))
          (is (= [{:name         "NAME"
                   :display_name "Name"
                   :base_type    :type/Text}]
                 (qp.store/miscellaneous-value [::qp.results-metadata/card-stored-metadata]))))))))

;;; adapted from [[metabase.queries.api.card-test/model-card-test-2]]
(deftest ^:parallel preserve-model-metadata-test
  (testing "Cards preserve their edited metadata"
    (letfn [(base-type->semantic-type [base-type]
              (condp #(isa? %2 %1) base-type
                :type/Integer :type/Quantity
                :type/Float   :type/Cost
                :type/Text    :type/Name
                base-type))
            (add-user-edits [cols]
              (assert (seq cols))
              (for [col cols]
                (assoc col
                       :description   "user description"
                       :display_name  "user display name"
                       :semantic_type (base-type->semantic-type (:base_type col)))))]
      ;; use a MetadataProvider to build cards and populate metadata, but we have to use `with-temp` before
      ;; calling [[run-query-for-card]] since the Card QP code does not currently fully support metadata providers.
      (let [mp (as-> (mt/application-database-metadata-provider (mt/id)) mp
                 (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                  mp
                  [{:database (mt/id)
                    :type     :query
                    :query    {:source-table (mt/id :venues)}}
                   {:database (mt/id)
                    :type     :query
                    :query    {:source-table "card__1"}}]))]
        (mt/with-temp [:model/Card card-1 (let [card-1 (lib.metadata/card mp 1)]
                                            {:dataset_query   (:dataset-query card-1)
                                             :type            :model
                                             :result_metadata (add-user-edits (:result-metadata card-1))})
                       :model/Card card-2 (let [card-2 (lib.metadata/card mp 2)]
                                            {:dataset_query   (-> (:dataset-query card-2)
                                                                  (assoc-in [:query :source-table] (format "card__%d" (:id card-1))))
                                             :result_metadata (:result-metadata card-2)})]
          (doseq [[card-type card-id] {"model"                     (:id card-1)
                                       "card with model as source" (:id card-2)}]
            (testing card-type
              (is (=? [{:name "ID",          :description "user description", :display_name "user display name", :semantic_type :type/Quantity}
                       {:name "NAME",        :description "user description", :display_name "user display name", :semantic_type :type/Name}
                       {:name "CATEGORY_ID", :description "user description", :display_name "user display name", :semantic_type :type/Quantity}
                       {:name "LATITUDE",    :description "user description", :display_name "user display name", :semantic_type :type/Cost}
                       {:name "LONGITUDE",   :description "user description", :display_name "user display name", :semantic_type :type/Cost}
                       {:name "PRICE",       :description "user description", :display_name "user display name", :semantic_type :type/Quantity}]
                      (mt/cols (run-query-for-card card-id)))))))))))
